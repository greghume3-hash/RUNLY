// Écran "Historique" — liste toutes les séances marquées par l'utilisateur
// (done / partial / skipped), du plus récent au plus ancien, avec les notes.
//
// Utile pour :
// - Visualiser la régularité et les progrès
// - Relire les ressentis passés
// - Préparer l'adaptation dynamique future

import { navigate } from "../router.js";
import { profile, completions, clearCompletion } from "../store.js";
import { getPaces } from "../plan/paces.js";
import { generatePlan } from "../plan/periodization.js";

const DAY_FULL = {
  mon: "Lundi", tue: "Mardi", wed: "Mercredi",
  thu: "Jeudi", fri: "Vendredi", sat: "Samedi", sun: "Dimanche",
};

const STATUS_LABEL = { done: "Fait", partial: "Partielle", skipped: "Passée" };

const FAMILY_LABELS = {
  long: "Sortie longue",
  vma_long: "VMA longue",
  vma_short: "VMA courte",
  hills: "Côtes",
  threshold: "Seuil",
  specific_pace: "Allure course",
  easy: "Footing",
  recovery: "Récupération",
  cross: "Cross-training",
  walk_run: "Marche-course",
};

const FAMILY_COLORS = {
  long: "#7c3aed",
  vma_long: "#dc2626",
  vma_short: "#dc2626",
  hills: "#b45309",
  threshold: "#ea580c",
  specific_pace: "#0891b2",
  easy: "#16a34a",
  recovery: "#0ea5e9",
  cross: "#6b7280",
  walk_run: "#14b8a6",
};

export function historyScreen(root) {
  // On regénère le plan pour retrouver les séances correspondant aux clés.
  // Pas optimal mais suffisant pour l'usage (algo rapide).
  const paces = getPaces(profile);
  const plan = profile.objectiveType ? generatePlan({ profile, paces }) : null;
  render(root, { plan });
}

function render(root, ctx) {
  const entries = buildHistoryEntries(ctx.plan);
  const stats = computeStats(entries);

  root.innerHTML = `
    <main class="plan-screen">
      <header class="history-header">
        <button class="icon-btn" id="back-btn" type="button" aria-label="Retour">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h1>Historique</h1>
      </header>

      ${renderStatsBlock(stats)}

      ${entries.length === 0
        ? renderEmptyState()
        : renderEntries(entries)}
    </main>
  `;

  root.querySelector("#back-btn").addEventListener("click", () => navigate("plan"));

  // Actions par entrée : supprimer une complétion
  root.querySelectorAll("[data-delete-key]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = btn.dataset.deleteKey;
      const [w, day] = key.replace("w", "").split(":");
      if (confirm("Supprimer cette entrée de l'historique ?")) {
        clearCompletion(Number(w), day);
        render(root, ctx);
      }
    });
  });
}

// ---------------------------------------------------------------------
// Assemblage des entrées
// ---------------------------------------------------------------------

function buildHistoryEntries(plan) {
  const entries = [];
  for (const [key, comp] of Object.entries(completions)) {
    // key = "w3:tue"
    const m = key.match(/^w(\d+):(.+)$/);
    if (!m) continue;
    const weekNumber = Number(m[1]);
    const day = m[2];

    // Retrouver la séance correspondante si le plan est dispo
    let session = null;
    if (plan) {
      const week = plan.weeks.find((w) => w.weekNumber === weekNumber);
      const dayData = week?.days[day];
      if (dayData?.type === "session") session = dayData.session;
    }

    entries.push({
      key,
      weekNumber,
      day,
      status: comp.status,
      note: comp.note ?? "",
      doneAt: comp.doneAt,
      session,
    });
  }

  // Tri : plus récent d'abord (par doneAt, puis par weekNumber décroissant)
  entries.sort((a, b) => {
    if (a.doneAt && b.doneAt) return b.doneAt.localeCompare(a.doneAt);
    if (a.doneAt) return -1;
    if (b.doneAt) return 1;
    return b.weekNumber - a.weekNumber;
  });

  return entries;
}

function computeStats(entries) {
  const total = entries.length;
  const done = entries.filter((e) => e.status === "done").length;
  const partial = entries.filter((e) => e.status === "partial").length;
  const skipped = entries.filter((e) => e.status === "skipped").length;

  // Minutes totales (pour les séances qu'on peut retrouver)
  const totalMin = entries
    .filter((e) => (e.status === "done" || e.status === "partial") && e.session)
    .reduce(
      (acc, e) => acc + (e.session.totalDurationMin || 0) * (e.status === "partial" ? 0.5 : 1),
      0
    );

  return { total, done, partial, skipped, totalMin: Math.round(totalMin) };
}

// ---------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------

function renderStatsBlock(stats) {
  if (stats.total === 0) return "";
  const hours = Math.floor(stats.totalMin / 60);
  const minutes = stats.totalMin % 60;
  return `
    <div class="week-summary" style="margin-bottom:24px">
      <div class="week-summary__item">
        <strong style="color:#166534">${stats.done}</strong>
        <span>faites</span>
      </div>
      <div class="week-summary__item">
        <strong style="color:#854d0e">${stats.partial}</strong>
        <span>partielles</span>
      </div>
      <div class="week-summary__item">
        <strong class="muted">${stats.skipped}</strong>
        <span>passées</span>
      </div>
      <div class="week-summary__item">
        <strong>${hours}h${minutes.toString().padStart(2, "0")}</strong>
        <span>total</span>
      </div>
    </div>
  `;
}

function renderEmptyState() {
  return `
    <div class="history-empty">
      <div class="history-empty__icon">🏃</div>
      <p>Pas encore de séance enregistrée.</p>
      <p class="muted small">Marque tes séances comme faites depuis l'écran plan pour voir ton historique ici.</p>
    </div>
  `;
}

function renderEntries(entries) {
  // Groupe par semaine pour plus de lisibilité
  const byWeek = new Map();
  for (const e of entries) {
    if (!byWeek.has(e.weekNumber)) byWeek.set(e.weekNumber, []);
    byWeek.get(e.weekNumber).push(e);
  }
  const sortedWeeks = [...byWeek.keys()].sort((a, b) => b - a);

  return `
    <ul class="history-list">
      ${sortedWeeks
        .map((wn) => {
          const group = byWeek.get(wn);
          return `
            <li class="history-week">
              <div class="history-week__header">Semaine ${wn}</div>
              <ul class="history-week__entries">
                ${group.map(renderEntry).join("")}
              </ul>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

function renderEntry(entry) {
  const { status, note, session, day } = entry;
  const color = session ? FAMILY_COLORS[session.family] ?? "#64748b" : "#64748b";
  const label = session ? FAMILY_LABELS[session.family] ?? session.family : "Séance";
  const duration = session ? `${session.totalDurationMin} min` : "";
  const dateStr = entry.doneAt ? formatShortDate(entry.doneAt) : "";

  return `
    <li class="history-entry" style="border-left-color:${color}">
      <div class="history-entry__top">
        <div>
          <div class="history-entry__title">
            ${DAY_FULL[day]} · ${escapeHtml(label)}
          </div>
          <div class="muted small">
            <span class="history-status history-status--${status}">${STATUS_LABEL[status]}</span>
            ${duration ? ` · ${duration}` : ""}
            ${dateStr ? ` · ${dateStr}` : ""}
          </div>
        </div>
        <button class="icon-btn-small" type="button" data-delete-key="${entry.key}" aria-label="Supprimer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6M5 6l1 14a2 2 0 002 2h8a2 2 0 002-2l1-14"/></svg>
        </button>
      </div>
      ${note ? `<p class="history-entry__note">${escapeHtml(note)}</p>` : ""}
    </li>
  `;
}

// ---------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------

function formatShortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now - d;
  const diffH = diffMs / 3600_000;
  if (diffH < 24) return "aujourd'hui";
  if (diffH < 48) return "hier";
  const diffDays = Math.floor(diffH / 24);
  if (diffDays < 7) return `il y a ${diffDays} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
