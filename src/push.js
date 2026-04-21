// Module push notifications côté frontend.
// Gère : demande de permission, subscription au PushService, envoi au backend.

// La clé publique VAPID est exposée au client via window (injectée côté build).
// Pour V1 simple : on la lit depuis une variable globale qu'on alimente
// à partir d'une env var Vite.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

// Convertit une base64-url en Uint8Array (format attendu par applicationServerKey)
function urlB64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Vérifie que l'environnement supporte les push (SW + PushManager)
export function isPushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// Retourne la permission actuelle : "default" | "granted" | "denied"
export function getPermission() {
  return typeof Notification !== "undefined" ? Notification.permission : "denied";
}

// Demande la permission si pas encore demandée. Retourne la permission finale.
export async function requestPermission() {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

// S'abonne au push service. Retourne la subscription (objet à envoyer au backend).
export async function subscribeToPush() {
  if (!VAPID_PUBLIC_KEY) {
    throw new Error("missing_vapid_key");
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  return sub;
}

// Désinscrit côté navigateur
export async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
  return sub;
}

// Envoie la subscription au backend avec le planning des notifs.
// `schedule` = [{ date: "YYYY-MM-DD", isMorning, isEvening, title, body }]
export async function registerSubscription(subscription, schedule) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription, timezone, schedule }),
  });
  if (!res.ok) throw new Error(`subscribe_failed_${res.status}`);
  return res.json();
}

// Supprime la subscription côté backend
export async function unregisterSubscription(subscription) {
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription }),
  });
}

// Envoie une notification test à la subscription donnée
export async function sendTestNotification(subscription) {
  const res = await fetch("/api/push/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription }),
  });
  if (!res.ok) throw new Error(`test_failed_${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------
// Helper : construit le planning des notifs pour les 30 prochains jours
// ---------------------------------------------------------------------
// À partir du plan généré, produit un array de schedule items utilisables
// par le dispatcher.
export function buildScheduleFromPlan(plan, firstName = "") {
  const items = [];
  const greeting = firstName ? `${firstName}, ` : "";
  const today = new Date();
  // On limite à 30 jours d'avance (largement suffisant pour 1 semaine visible)
  const horizon = new Date(today.getTime() + 30 * 86400e3);

  // On ne connaît pas les dates absolues du plan (il est stocké par weekNumber).
  // Stratégie : l'utilisateur ouvre l'app = aujourd'hui est la semaine courante.
  // On projette les jours de la semaine courante + les 3 suivantes.
  const currentWeekStart = startOfWeek(today);

  for (const week of plan.weeks.slice(0, 4)) {
    const offsetDays = (week.weekNumber - plan.weeks[0].weekNumber) * 7;
    for (const [dayKey, dayData] of Object.entries(week.days)) {
      if (dayData?.type !== "session") continue;
      const dayIdx = ["mon","tue","wed","thu","fri","sat","sun"].indexOf(dayKey);
      const when = new Date(currentWeekStart);
      when.setDate(when.getDate() + offsetDays + dayIdx);
      if (when < today || when > horizon) continue;

      const dateIso = when.toISOString().slice(0, 10);
      const s = dayData.session;
      const label = familyLabel(s.family);

      // Rappel du matin (jour même)
      items.push({
        date: dateIso,
        isMorning: true,
        title: "Runly 🏃",
        body: `${greeting}aujourd'hui : ${label} · ${s.totalDurationMin} min.`,
      });

      // Rappel de la veille uniquement pour les séances "importantes"
      const isKey =
        s.family?.startsWith("vma") ||
        s.family === "threshold" ||
        s.family === "long" ||
        s.family === "specific_pace" ||
        s.family === "hills";
      if (isKey) {
        items.push({
          date: dateIso,
          isEvening: true,
          title: "Demain : séance clé",
          body: `${label} · ${s.totalDurationMin} min. Bien dormir cette nuit 💤`,
        });
      }
    }
  }
  return items;
}

function startOfWeek(d) {
  const out = new Date(d);
  const day = out.getDay(); // 0=dim, 1=lun
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function familyLabel(family) {
  return {
    long: "Sortie longue",
    vma_long: "VMA longue",
    vma_short: "VMA courte",
    hills: "Côtes",
    threshold: "Seuil",
    specific_pace: "Allure course",
    easy: "Footing",
    recovery: "Récupération",
    cross: "Cross-training",
    bike: "Vélo",
    brick: "Run + vélo",
    commute: "Vélotaff",
    walk_run: "Marche-course",
  }[family] ?? "Séance";
}
