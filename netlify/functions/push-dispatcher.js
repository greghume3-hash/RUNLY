// Scheduled function — tourne toutes les heures.
// Parcourt toutes les subscriptions, détermine si une notif est due à
// CE moment pour CETTE subscription (selon son timezone + son schedule),
// et l'envoie via web-push.
//
// Règles :
//  - Rappel veille : envoyé à 20h locale si une séance de qualité est
//    prévue demain.
//  - Rappel matin : envoyé à 7h locale si une séance est prévue aujourd'hui.
//  - On envoie une notif au maximum 1 fois par schedule item (flag `sent`).

import webpush from "web-push";
import { getStore } from "@netlify/blobs";

// Heure locale actuelle pour un timezone donné (IANA)
function nowInTz(timezone) {
  // toLocaleString avec timezone — renvoie "YYYY-MM-DD HH:MM:SS"
  try {
    const now = new Date();
    // Intl.DateTimeFormat avec parties
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      hour: Number(get("hour")),
      minute: Number(get("minute")),
    };
  } catch {
    const d = new Date();
    return {
      date: d.toISOString().slice(0, 10),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
    };
  }
}

// Tolérance d'une heure (±30 min) autour de 07:00 et 20:00
function isMorningWindow(h) { return h === 7 || h === 8; }
function isEveningWindow(h) { return h === 20 || h === 21; }

export default async (req, context) => {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    return new Response(JSON.stringify({ error: "missing_vapid_keys" }), { status: 500 });
  }
  webpush.setVapidDetails("mailto:contact@runly.local", pub, priv);

  const store = getStore("runly-push");
  const list = await store.list();

  let sent = 0;
  let failed = 0;

  for (const { key } of list.blobs) {
    try {
      const rec = await store.get(key, { type: "json" });
      if (!rec?.subscription?.endpoint) continue;

      const { date, hour } = nowInTz(rec.timezone || "Europe/Paris");
      const schedule = rec.schedule || [];
      let modified = false;

      for (const item of schedule) {
        if (item.sent) continue;
        // Matin : notif du jour même
        if (item.isMorning && item.date === date && isMorningWindow(hour)) {
          await sendNotif(rec.subscription, item);
          item.sent = true;
          modified = true;
          sent++;
        }
        // Soir : notif la VEILLE (item.date = demain)
        // donc aujourd'hui (date) + 1 jour === item.date
        if (
          item.isEvening &&
          isEveningWindow(hour) &&
          addDays(date, 1) === item.date
        ) {
          await sendNotif(rec.subscription, item);
          item.sent = true;
          modified = true;
          sent++;
        }
      }

      if (modified) {
        await store.setJSON(key, rec);
      }
    } catch (err) {
      failed++;
      // Si subscription invalide (410/404) → on supprime
      if (
        String(err).includes("410") ||
        String(err).includes("404") ||
        err?.statusCode === 410 ||
        err?.statusCode === 404
      ) {
        await store.delete(key);
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, sent, failed, total: list.blobs.length }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

async function sendNotif(subscription, item) {
  const payload = JSON.stringify({
    title: item.title || "Runly 🏃",
    body: item.body || "Ta séance est prête.",
    tag: `runly-${item.date}-${item.isMorning ? "m" : "e"}`,
    url: "/",
  });
  await webpush.sendNotification(subscription, payload);
}

function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Scheduled configuration pour Netlify
export const config = {
  schedule: "0 * * * *", // toutes les heures pile
};
