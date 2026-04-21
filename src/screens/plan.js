// Écran utilisateur "Ton plan".
// Vue principale : semaine courante en calendrier, navigation W-1/W+1.
// Vue secondaire : macro (toutes les semaines empilées).
// Tap sur une séance → modale détail.

import { navigate } from "../router.js";
import {
  profile,
  updateProfile,
  getCompletion,
  setCompletion,
  clearCompletion,
} from "../store.js";
import { getPaces } from "../plan/paces.js";
import { generatePlan } from "../plan/periodization.js";
import {
  fetchRoute,
  extractRouteStats,
  estimateRouteDistance,
} from "../plan/route.js";
import {
  geojsonToGpx,
  shareGpx,
  downloadGpx,
} from "../plan/gpx.js";
import { sessionToTcxWorkout, sendToGarminWatch } from "../plan/tcx.js";
import { computeAdjustment, applyAdjustmentToWeek } from "../plan/adaptation.js";

const DAYS_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_SHORT = { mon: "L", tue: "M", wed: "M", thu: "J", fri: "V", sat: "S", sun: "D" };
const DAY_FULL = { mon: "Lundi", tue: "Mardi", wed: "Mercredi", thu: "Jeudi", fri: "Vendredi", sat: "Samedi", sun: "Dimanche" };

const PHASE_LABELS = {
  base: { label: "Base", color: "#3b82f6" },
  development: { label: "Développement", color: "#16a34a" },
  specific: { label: "Spécifique", color: "#d97706" },
  taper: { label: "Affûtage", color: "#db2777" },
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
  bike: "#0ea5e9",
  brick: "#8b5cf6",
  commute: "#ca8a04", // jaune/ocre pour le vélotaff (bien visible)
  walk_run: "#14b8a6",
};

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
  bike: "Vélo",
  brick: "Course + vélo",
  commute: "Vélotaff",
  walk_run: "Marche-course",
};

// État local
let view = "week"; // "week" | "overview"
let currentWeekIdx = 0;
let detailSessionKey = null; // "weekIdx:day" pour ouvrir la modale

// ---------------------------------------------------------------------

export function planScreen(root) {
  // Génère le plan à la volée (rapide) depuis le profil stocké
  const paces = getPaces(profile);
  const plan = generatePlan({ profile, paces });

  // Adaptation dynamique : pour chaque semaine, on regarde les complétions
  // de la semaine précédente et on ajuste si besoin (séances passées, blessure).
  // On n'adapte QUE la semaine courante + la suivante, pas tout le plan.
  const currentIdx = currentWeekIdx;
  for (let i = 1; i < plan.weeks.length; i++) {
    const previousWeek = plan.weeks[i - 1];
    const adjustment = computeAdjustment({ previousWeek, profile });
    if (adjustment.type !== "none") {
      applyAdjustmentToWeek(plan.weeks[i], adjustment);
    }
  }

  // Sauvegarde un résumé du plan dans localStorage pour persistance
  if (!profile.planGeneratedAt) {
    updateProfile({
      planGeneratedAt: new Date().toISOString(),
      paceConfidence: paces.confidence,
    });
  }

  render(root, { plan, paces });
}

function render(root, ctx) {
  root.innerHTML = `
    <main class="plan-screen">
      ${renderHeader(ctx)}
      ${view === "week" ? renderWeekView(ctx) : renderOverviewView(ctx)}
      ${detailSessionKey ? renderSessionModal(ctx) : ""}
    </main>
  `;
  attachListeners(root, ctx);
}

// ---------------------------------------------------------------------
// Header : nom/prénom + switch vue
// ---------------------------------------------------------------------

function renderHeader({ plan, paces }) {
  const name = profile.firstName || "Coureur";
  const objLabel = objectiveLabel();
  return `
    <header class="plan-header">
      <div>
        <p class="plan-header__hello">Salut ${escapeHtml(name)} 👋</p>
        <h1 class="plan-header__title">${escapeHtml(objLabel)}</h1>
        <p class="plan-header__meta muted">
          ${plan.weeksCount} semaines · VMA ${paces.vmaKmh} km/h
          ${paces.needsTest ? ' · <span class="warn-inline">test VMA recommandé</span>' : ""}
        </p>
      </div>
      <div class="plan-header__actions">
        <button class="icon-btn" id="history-btn" type="button" aria-label="Historique" title="Mon historique">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </button>
        <button class="icon-btn" id="restart-btn" type="button" aria-label="Refaire mon plan" title="Refaire mon plan">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </button>
      </div>
    </header>

    <nav class="plan-tabs">
      <button class="plan-tab ${view === "week" ? "plan-tab--active" : ""}" data-view="week" type="button">
        Semaine
      </button>
      <button class="plan-tab ${view === "overview" ? "plan-tab--active" : ""}" data-view="overview" type="button">
        Vue d'ensemble
      </button>
    </nav>
  `;
}

function objectiveLabel() {
  const labels = {
    fitness_restart: "(Re)mise au sport",
    weight_loss: "Perte de poids",
    maintain: "Maintenir la forme",
    "5k": "Préparation 5 km",
    "10k": "Préparation 10 km",
    half: "Préparation semi-marathon",
    marathon: "Préparation marathon",
    trail_45: "Préparation trail 45 km",
    trail_60: "Préparation trail 60 km",
    trail_80: "Préparation trail 80 km",
    trail_120: "Préparation trail 120 km",
    trail_160: "Préparation trail 160 km",
  };
  return labels[profile.objectiveType] ?? "Ton plan";
}

// ---------------------------------------------------------------------
// Vue semaine
// ---------------------------------------------------------------------

function renderWeekView({ plan }) {
  const week = plan.weeks[currentWeekIdx];
  if (!week) return "<p>Semaine introuvable.</p>";

  const phase = PHASE_LABELS[week.phase] ?? { label: week.phase, color: "#64748b" };
  const acwr = plan.acwrHistory[currentWeekIdx];
  const acwrColor = acwr.zone === "red" ? "#dc2626" : acwr.zone === "yellow" ? "#ca8a04" : "#16a34a";

  return `
    <section class="week-view">
      <div class="week-nav">
        <button class="icon-btn" id="prev-week" type="button" ${currentWeekIdx === 0 ? "disabled" : ""} aria-label="Semaine précédente">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="week-nav__title">
          <div>Semaine ${week.weekNumber}<span class="muted"> / ${plan.weeksCount}</span></div>
          <span class="phase-pill" style="background:${phase.color}20;color:${phase.color}">${phase.label}${week.isDeload ? " · allègement" : ""}</span>
        </div>
        <button class="icon-btn" id="next-week" type="button" ${currentWeekIdx >= plan.weeksCount - 1 ? "disabled" : ""} aria-label="Semaine suivante">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      ${week.adaptation && week.adaptation.type !== "none" ? `
        <div class="adaptation-banner adaptation-banner--${week.adaptation.type}">
          <strong>⚡ Plan adapté</strong>
          <p>${escapeHtml(week.adaptation.reason)}</p>
        </div>
      ` : ""}

      <div class="week-summary">
        <div class="week-summary__item"><strong>${week.stats.sessionCount}</strong><span>séances</span></div>
        <div class="week-summary__item"><strong>${week.targetVolumeKm ?? "—"} km</strong><span>volume cible</span></div>
        <div class="week-summary__item"><strong>${Math.round(week.stats.totalMin / 60 * 10) / 10} h</strong><span>temps total</span></div>
        <div class="week-summary__item">
          <strong style="color:${acwrColor}">${acwr.ratio}</strong>
          <span>charge ${acwr.lowVolume ? "(estimée)" : ""}</span>
        </div>
      </div>

      <ul class="session-list">
        ${DAYS_ORDER.map((d) => renderSessionCard(d, week.days[d], week.weekNumber)).join("")}
      </ul>

      ${renderWeekCompletionBar(week)}

      <p class="muted center small">
        Tape sur une séance pour voir les détails.
      </p>
    </section>
  `;
}

function renderSessionCard(day, data, weekNumber) {
  if (!data) return "";
  if (data.type === "rest") {
    const isCommute = data.commute;
    const isSession = data.commuteIsSession;
    const label = isCommute
      ? isSession
        ? `Vélotaff cross (${data.commuteClass?.equivKm} km équiv.)`
        : "Repos"
      : "Repos";
    const sub = isCommute && isSession
      ? "Le vélotaff remplace ta séance aujourd'hui"
      : isCommute
      ? null
      : null;
    return `
      <li class="session-row session-row--rest">
        <div class="session-row__day">${DAY_FULL[day]}${isCommute ? ' 🚴' : ""}</div>
        <div class="session-row__body">
          <span class="muted">${label}</span>
          ${sub ? `<div class="muted small">${sub}</div>` : ""}
        </div>
      </li>
    `;
  }
  const s = data.session;
  const color = FAMILY_COLORS[s.family] ?? "#64748b";
  const label = FAMILY_LABELS[s.family] ?? s.family;
  const completion = getCompletion(weekNumber, day);
  const statusClass = completion ? `session-row--${completion.status}` : "";
  const statusIcon = completion
    ? completion.status === "done"
      ? `<span class="session-status session-status--done" aria-label="Fait">✓</span>`
      : completion.status === "partial"
      ? `<span class="session-status session-status--partial" aria-label="Partielle">◐</span>`
      : `<span class="session-status session-status--skipped" aria-label="Passée">—</span>`
    : "";
  const adapted = data.commuteAdaptation;
  return `
    <li class="session-row ${statusClass}" data-session-day="${day}" role="button" tabindex="0" style="border-left-color:${color}">
      <div class="session-row__day">
        ${DAY_FULL[day]}${data.commute ? ' 🚴' : ""}
      </div>
      <div class="session-row__body">
        <div class="session-row__title">${escapeHtml(label)}</div>
        <div class="muted small">${s.totalDurationMin} min · ${difficultyLabel(s.difficulty)}${adapted ? ` · <span class="adapted-tag">⚡ adapté vélotaff</span>` : ""}</div>
      </div>
      ${statusIcon}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="muted"><polyline points="9 18 15 12 9 6"/></svg>
    </li>
  `;
}

function difficultyLabel(d) {
  return { easy: "facile", moderate: "modéré", hard: "dur", very_hard: "très dur" }[d] ?? d;
}

// Barre de complétion hebdomadaire
function renderWeekCompletionBar(week) {
  const sessionDays = DAYS_ORDER.filter(
    (d) => week.days[d]?.type === "session"
  );
  if (sessionDays.length === 0) return "";
  const done = sessionDays.filter(
    (d) => getCompletion(week.weekNumber, d)?.status === "done"
  ).length;
  const partial = sessionDays.filter(
    (d) => getCompletion(week.weekNumber, d)?.status === "partial"
  ).length;
  const skipped = sessionDays.filter(
    (d) => getCompletion(week.weekNumber, d)?.status === "skipped"
  ).length;
  const total = sessionDays.length;
  const completionPct = Math.round(((done + partial * 0.5) / total) * 100);

  let encouragement = "";
  if (done + partial + skipped === 0) encouragement = "Commence quand tu veux.";
  else if (completionPct >= 90) encouragement = "🔥 Semaine réussie !";
  else if (completionPct >= 60) encouragement = "Bien engagé·e.";
  else if (completionPct > 0) encouragement = "Continue, on n'est pas sur la perfection.";

  return `
    <div class="week-completion">
      <div class="week-completion__row">
        <strong>${done}/${total}</strong>
        <span class="muted small">séances faites${partial ? ` · ${partial} partielle(s)` : ""}${skipped ? ` · ${skipped} passée(s)` : ""}</span>
      </div>
      <div class="vol-bar">
        <div class="vol-bar__fill" style="width:${completionPct}%;background:#16a34a"></div>
      </div>
      ${encouragement ? `<p class="muted small center" style="margin:8px 0 0 0">${encouragement}</p>` : ""}
    </div>
  `;
}

// ---------------------------------------------------------------------
// Vue macro (toutes les semaines)
// ---------------------------------------------------------------------

function renderOverviewView({ plan }) {
  const maxVol = Math.max(...plan.volumePlan.targets.map((t) => t.km));
  return `
    <section class="overview-view">
      <div class="phases-legend">
        ${Object.entries(PHASE_LABELS)
          .map(([, p]) => `<span class="phase-pill" style="background:${p.color}20;color:${p.color}">${p.label}</span>`)
          .join("")}
      </div>

      <ul class="overview-list">
        ${plan.weeks
          .map((w, i) => {
            const target = plan.volumePlan.targets[i];
            const phase = PHASE_LABELS[w.phase] ?? { label: w.phase, color: "#64748b" };
            const barW = Math.round((target.km / maxVol) * 100);
            return `
              <li class="overview-row ${currentWeekIdx === i ? "overview-row--current" : ""}" data-week-idx="${i}" role="button" tabindex="0">
                <div class="overview-row__week">S${w.weekNumber}</div>
                <div class="overview-row__phase">
                  <span class="phase-pill" style="background:${phase.color}20;color:${phase.color}">${phase.label}</span>
                  ${target.isDeload ? '<span class="muted small">allègement</span>' : ""}
                </div>
                <div class="overview-row__volume">
                  <div class="vol-bar"><div class="vol-bar__fill" style="width:${barW}%;background:${phase.color}"></div></div>
                  <span class="small">${target.km} km</span>
                </div>
                <div class="overview-row__sessions muted small">
                  ${w.stats.sessionCount} séances · ${Math.round(w.stats.totalMin / 60 * 10) / 10} h
                </div>
              </li>
            `;
          })
          .join("")}
      </ul>
    </section>
  `;
}

// ---------------------------------------------------------------------
// Modale détail séance
// ---------------------------------------------------------------------

function renderSessionModal({ plan }) {
  const [wIdx, day] = detailSessionKey.split(":");
  const week = plan.weeks[Number(wIdx)];
  const dayData = week?.days[day];
  if (!dayData || dayData.type !== "session") return "";
  const s = dayData.session;
  const color = FAMILY_COLORS[s.family] ?? "#64748b";
  const label = FAMILY_LABELS[s.family] ?? s.family;
  const completion = getCompletion(week.weekNumber, day);

  return `
    <div class="modal" id="session-modal">
      <div class="modal__backdrop" data-close="1"></div>
      <div class="modal__panel">
        <button class="modal__close" id="modal-close" type="button" aria-label="Fermer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>

        <header class="modal__header">
          <span class="phase-pill" style="background:${color}20;color:${color}">${label}</span>
          <h2>${DAY_FULL[day]} · Semaine ${week.weekNumber}</h2>
          <div class="muted">${s.totalDurationMin} min · ${difficultyLabel(s.difficulty)}</div>
          ${completion ? `<div class="completion-badge completion-badge--${completion.status}">
            ${completion.status === "done" ? "✓ Fait" : completion.status === "partial" ? "◐ Partielle" : "— Passée"}
          </div>` : ""}
        </header>

        <p class="intent">${escapeHtml(s.intent)}</p>

        ${s.templateId === "test-vma-3000" ? renderVmaTestResultBlock() : ""}

        ${renderGarminExport(s)}

        ${s.family === "bike" ? renderBikeExecutionChooser(s) : ""}

        ${renderRouteBlock(s)}

        <ol class="modal__blocks">
          ${s.blocks.map(renderBlock).join("")}
        </ol>

        ${renderTips(s.tips)}

        ${renderNoteBlock(week.weekNumber, day, completion)}

        <div class="modal__actions">
          ${
            completion
              ? `<button class="btn btn--outline" id="uncheck-btn" type="button">
                  Annuler "${completion.status === "done" ? "fait" : completion.status === "partial" ? "partielle" : "passée"}"
                </button>`
              : `
                <button class="btn btn--primary" id="mark-done-btn" type="button">
                  ✓ Marquer fait
                </button>
                <div class="modal__actions-row">
                  <button class="btn btn--outline" id="mark-partial-btn" type="button">
                    ◐ Partielle
                  </button>
                  <button class="btn btn--outline" id="mark-skipped-btn" type="button">
                    — Passer
                  </button>
                </div>
              `
          }
        </div>
      </div>
    </div>
  `;
}

function renderBlock(block) {
  const label = escapeHtml(block.label ?? "Bloc");
  const desc = escapeHtml(block.description ?? "");

  // Séquence (pyramide, etc.)
  if (block.type === "intervals" && block.sequence) {
    const stepsHtml = block.sequence
      .map((s) => {
        const l = s.workDistanceM ? `${s.workDistanceM} m` : `${s.workSec}s`;
        const r = s.recoverySec ? `· r ${s.recoverySec}s` : "";
        return `<li>${l} ${r}</li>`;
      })
      .join("");
    const series = block.repetitions > 1 ? ` (${block.repetitions} séries)` : "";
    return `
      <li class="block">
        <strong>Séquence${series}</strong> — ${escapeHtml(block.sequenceSummary ?? "")}
        <ol class="block__steps">${stepsHtml}</ol>
        <p class="muted small">${desc}</p>
      </li>`;
  }

  // Intervalles standards (distance ou temps)
  if (block.type === "intervals") {
    const w = block.work ?? {};
    const head = w.distance != null
      ? `${block.repetitions} × ${w.distance} m`
      : w.durationSec != null
      ? `${block.repetitions} × ${w.durationSec}s`
      : `${block.repetitions} répétitions`;
    const pace = w.paceTarget
      ? `${w.paceTarget.value}/km (${w.speedTarget.value} km/h${w.timeTarget ? ` · ${w.timeTarget.value}` : ""})`
      : w.speedTarget ? `${w.speedTarget.value} ${w.speedTarget.unit}` : "";
    const rec = block.recovery
      ? block.recovery.durationSec != null
        ? `Récup ${block.recovery.durationSec}s ${block.recovery.type === "walk_down" ? "redescente" : "trot"}`
        : block.recovery.durationMin != null
        ? `Récup ${block.recovery.durationMin} min`
        : ""
      : "";
    return `
      <li class="block">
        <strong>${head}</strong> à ${pace}
        ${rec ? `<div class="muted small">${rec}</div>` : ""}
        <p class="muted small">${desc}</p>
        ${block.tips ? `<p class="small tip">💡 ${escapeHtml(block.tips)}</p>` : ""}
      </li>`;
  }

  // Tempo / seuil (structuré ou libre)
  if (block.type === "tempo") {
    const w = block.work;
    if (!w && block.durationMin) {
      return `<li class="block"><strong>${label}</strong> — ${block.durationMin} min<p class="muted small">${desc}</p></li>`;
    }
    const ww = w ?? {};
    const head = ww.durationMin != null
      ? `${block.repetitions ?? 1} × ${ww.durationMin} min`
      : ww.distanceKm != null
      ? `${ww.distanceKm} km`
      : "Bloc";
    const pace = ww.paceTarget ? `à ${ww.paceTarget.value}/km (${ww.speedTarget.value} km/h)` : "";
    return `
      <li class="block">
        <strong>${head}</strong> ${pace}
        ${block.recovery?.durationMin ? `<div class="muted small">Récup ${block.recovery.durationMin} min trot</div>` : ""}
        <p class="muted small">${desc}</p>
      </li>`;
  }

  // Warmup / cooldown
  if (block.type === "warmup" || block.type === "cooldown") {
    return `
      <li class="block">
        <strong>${label}</strong> — ${block.durationMin} min
        ${block.paceTarget ? `<span class="muted small"> (${block.paceTarget.min}–${block.paceTarget.max}/km)</span>` : ""}
        <p class="muted small">${desc}</p>
      </li>`;
  }

  // Drills / easy / cross / recovery
  const pace =
    block.paceTarget?.value && block.speedTarget?.value
      ? ` à ${block.paceTarget.value}/km (${block.speedTarget.value} km/h)`
      : "";
  return `
    <li class="block">
      <strong>${label}</strong> — ${block.durationMin ?? ""} min${pace}
      <p class="muted small">${desc}</p>
    </li>`;
}

// Bloc choix du support d'exécution pour une séance vélo structurée.
// Principe : l'algo a prescrit une CHARGE CIBLE (durée + zone).
// L'utilisateur choisit comment l'exécuter :
//   - Home trainer (structure précise, cadence, intervalles)
//   - Vélo extérieur (boucle libre, même charge cible)
//   - Prolongation du vélotaff (ajoute un détour ce jour-là)
function renderBikeExecutionChooser(session) {
  const eq = profile.equipment ?? [];
  const hasIndoor = eq.includes("home_trainer") || eq.includes("indoor_bike");
  const hasCommute = (profile.commuteDays ?? []).length > 0;

  const tpl = session.blocks?.[0];
  const zone = session.family === "bike" && session.id
    ? sessionBikeMetadata(session)
    : null;

  return `
    <div class="bike-chooser">
      <div class="bike-chooser__head">
        <strong>🚴 Comment tu veux l'exécuter ?</strong>
        ${zone ? `<span class="muted small">Zone cible : <strong>${zone.zone}</strong> · ${zone.label}${zone.cadence ? ` · cadence ${zone.cadence[0]}-${zone.cadence[1]} rpm` : ""}</span>` : ""}
      </div>
      <div class="bike-chooser__options">
        ${hasIndoor ? `
          <button class="bike-chooser__btn" data-mode="indoor" type="button">
            <strong>🏠 Home trainer</strong>
            <span class="muted small">Structure précise, cadence ciblée</span>
          </button>
        ` : ""}
        <button class="bike-chooser__btn" data-mode="outdoor" type="button">
          <strong>🌳 Vélo extérieur</strong>
          <span class="muted small">Boucle libre à la bonne intensité</span>
        </button>
        ${hasCommute ? `
          <button class="bike-chooser__btn" data-mode="commute-ext" type="button">
            <strong>🚲 Détour sur ton vélotaff</strong>
            <span class="muted small">Prolonge ton trajet habituel</span>
          </button>
        ` : ""}
      </div>
      <div class="bike-chooser__advice" id="bike-mode-advice" hidden></div>
    </div>
  `;
}

// Récupère la méta vélo depuis le template (zone, cadence) sans re-résoudre tout
function sessionBikeMetadata(session) {
  // On passe via l'id du template pour récupérer les méta originales
  const byId = {
    "bike-endurance": { zone: "Z2", label: "Endurance fondamentale", cadence: [80, 90] },
    "bike-threshold": { zone: "Z4", label: "Seuil", cadence: [85, 95] },
    "bike-recovery":  { zone: "Z1", label: "Récupération",           cadence: [75, 85] },
  };
  return byId[session.templateId] ?? null;
}

// Bloc "Suggérer un parcours".
// Carte Leaflet centrée sur la position utilisateur.
// Le bouton appelle la Netlify Function /api/route (cf. src/plan/route.js)
// qui interroge OpenRouteService et renvoie un GeoJSON tracé sur la carte.
function renderRouteBlock(session) {
  // Pas de parcours pour le repos (on laisse cross pour le vélo)
  if (session.type === "rest") return "";

  const hasLocation = profile.locationLat != null && profile.locationLng != null;
  const mapId = `map-${session.id}`;
  const estimatedKm = estimateRouteDistance(session, profile);

  return `
    <div class="route-block">
      <div class="route-block__header">
        <strong>📍 Parcours</strong>
        ${hasLocation
          ? `<span class="muted small">~${estimatedKm} km cibles</span>`
          : '<span class="muted small">Localisation non renseignée</span>'}
      </div>
      ${hasLocation
        ? `<div class="route-map" id="${mapId}" data-lat="${profile.locationLat}" data-lng="${profile.locationLng}"></div>
           <div class="route-stats" id="route-stats" hidden></div>
           <p class="route-error muted small" id="route-error" hidden></p>`
        : `<p class="muted small">Renseigne ta localisation dans ton profil pour voir la carte.</p>`}
      <div class="route-actions">
        <button class="btn btn--outline" id="suggest-route-btn" type="button" ${hasLocation ? "" : "disabled"}>
          <span class="route-btn-label">Suggérer un parcours</span>
        </button>
        <button class="btn btn--link" id="new-route-btn" type="button" hidden>
          Autre variante
        </button>
      </div>
      <div class="route-export" id="route-export" hidden>
        <button class="btn btn--outline" id="download-gpx-btn" type="button">
          📥 Télécharger le tracé (GPX)
        </button>
        <p class="muted small" style="margin:4px 0 0 0">
          GPX = juste le tracé du parcours (à importer dans Garmin Connect ou Strava).
        </p>
      </div>
    </div>
  `;
}

// Bloc "Saisir le résultat du test VMA 3000m".
// Affiché uniquement dans la modale d'une séance test-vma-3000.
// Au submit : calcule la nouvelle VMA et met à jour le profil — toutes les
// allures des semaines suivantes sont recalculées automatiquement.
function renderVmaTestResultBlock() {
  const currentVma = profile.vma ?? null;
  return `
    <div class="vma-test-block">
      <div class="vma-test-block__header">
        <strong>📝 Saisir mon résultat</strong>
        ${currentVma ? `<span class="muted small">VMA actuelle : ${currentVma} km/h</span>` : ""}
      </div>
      <p class="muted small">
        Rentre le temps réalisé sur le 3000m — l'app recalculera ta VMA
        et ajustera toutes les allures des semaines suivantes.
      </p>
      <div class="vma-test-block__input">
        <input type="number" id="vma-test-min" min="8" max="20" placeholder="min" inputmode="numeric" style="width:70px" />
        <span>min</span>
        <input type="number" id="vma-test-sec" min="0" max="59" placeholder="sec" inputmode="numeric" style="width:70px" />
        <span>s</span>
        <button class="btn btn--primary" id="vma-test-submit" type="button">
          Mettre à jour ma VMA
        </button>
      </div>
      <p class="muted small" id="vma-test-result"></p>
    </div>
  `;
}

// Bloc "Envoyer sur ma montre" — génère un workout Garmin TCX avec les
// blocs structurés (warmup/intervalles/récups/cooldown + allures cibles).
// Une fois importé dans Garmin Connect, la montre guide l'utilisateur
// pendant la séance (bippe aux transitions, affiche l'allure cible).
//
// Disponible pour TOUTES les sessions sauf :
//   - commute (vélotaff, pas de structure à guider)
//   - walk_run (format alternance marche/course, mal géré par Garmin)
function renderGarminExport(session) {
  if (session.family === "commute") return "";
  if (session.family === "walk_run") return "";

  // Message adapté selon le type de séance
  const isStructured =
    session.family?.startsWith("vma") ||
    session.family === "threshold" ||
    session.family === "hills" ||
    session.family === "specific_pace";
  const hint = isStructured
    ? "Les blocs (échauffement / intervalles / récup / retour au calme) et les allures cibles seront transmis à ta montre. Elle te guidera en temps réel : bips aux transitions, allure cible affichée."
    : session.family === "long"
    ? "Ta montre te rappellera la durée cible et l'allure EF à tenir. Idéal pour ne pas partir trop vite."
    : session.family === "bike" || session.family === "brick"
    ? "Workout vélo/hybride importable dans Garmin Connect — s'affichera sur ta montre ou ton Edge."
    : "Ta montre t'indiquera la durée cible et l'allure confortable à maintenir.";

  return `
    <div class="garmin-export">
      <div class="garmin-export__header">
        <strong>⌚ Envoyer sur ma montre</strong>
        <span class="muted small">Workout Garmin structuré</span>
      </div>
      <button class="btn btn--garmin" id="garmin-send-btn" type="button">
        Générer et envoyer (TCX)
      </button>
      <p class="muted small" id="garmin-hint">${hint}</p>
      <p class="muted small" style="margin-top:0">
        → Le fichier se télécharge, <strong>Garmin Connect s'ouvre</strong>, clique <strong>Importer</strong> puis sélectionne le fichier. Sync automatique sur la montre.
      </p>
    </div>
  `;
}

// Bloc "Note post-séance" : textarea qui se met à jour au fil du temps.
// Affiché uniquement si la séance a été marquée (done/partial/skipped).
function renderNoteBlock(weekNumber, day, completion) {
  if (!completion) return "";
  const note = completion.note ?? "";
  return `
    <div class="note-block">
      <label class="note-block__label" for="session-note">
        📝 Tes notes sur cette séance
      </label>
      <textarea
        id="session-note"
        rows="3"
        placeholder="Ressenti, météo, allure réelle, douleurs…"
      >${escapeHtml(note)}</textarea>
      <p class="muted small" id="note-status">
        ${note ? "Sauvegardée automatiquement." : "Tape pour noter quelque chose."}
      </p>
    </div>
  `;
}

function renderTips(tips) {
  if (!tips) return "";
  const items = [];
  if (tips.before) items.push(`<li><strong>Avant :</strong> ${escapeHtml(tips.before)}</li>`);
  if (tips.during) items.push(`<li><strong>Pendant :</strong> ${escapeHtml(tips.during)}</li>`);
  if (tips.after) items.push(`<li><strong>Après :</strong> ${escapeHtml(tips.after)}</li>`);
  if (!items.length) return "";
  return `<ul class="session-tips">${items.join("")}</ul>`;
}

// ---------------------------------------------------------------------
// Listeners
// ---------------------------------------------------------------------

function attachListeners(root, ctx) {
  // Switch vues
  root.querySelectorAll(".plan-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      view = btn.dataset.view;
      render(root, ctx);
    });
  });

  // Historique
  root.querySelector("#history-btn")?.addEventListener("click", () => {
    navigate("history");
  });

  // Restart
  root.querySelector("#restart-btn")?.addEventListener("click", () => {
    if (confirm("Regénérer ton plan ? Les modifications non sauvegardées seront perdues.")) {
      navigate("welcome");
    }
  });

  // Nav semaine
  root.querySelector("#prev-week")?.addEventListener("click", () => {
    if (currentWeekIdx > 0) {
      currentWeekIdx--;
      render(root, ctx);
    }
  });
  root.querySelector("#next-week")?.addEventListener("click", () => {
    if (currentWeekIdx < ctx.plan.weeksCount - 1) {
      currentWeekIdx++;
      render(root, ctx);
    }
  });

  // Tap séance → modale
  root.querySelectorAll("[data-session-day]").forEach((row) => {
    const handler = () => {
      detailSessionKey = `${currentWeekIdx}:${row.dataset.sessionDay}`;
      render(root, ctx);
    };
    row.addEventListener("click", handler);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handler();
      }
    });
  });

  // Tap ligne macro → aller à cette semaine
  root.querySelectorAll("[data-week-idx]").forEach((row) => {
    row.addEventListener("click", () => {
      currentWeekIdx = Number(row.dataset.weekIdx);
      view = "week";
      render(root, ctx);
    });
  });

  // Fermeture + actions modale
  if (detailSessionKey) {
    const [wIdx, day] = detailSessionKey.split(":");
    const week = ctx.plan.weeks[Number(wIdx)];
    const dayData = week?.days[day];

    const close = () => {
      detailSessionKey = null;
      render(root, ctx);
    };
    root.querySelector("#modal-close")?.addEventListener("click", close);
    root.querySelector("[data-close]")?.addEventListener("click", close);
    const escHandler = (e) => {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);

    // Actions de complétion
    const markAs = (status) => () => {
      setCompletion(week.weekNumber, day, { status });
      render(root, ctx);
    };
    root.querySelector("#mark-done-btn")?.addEventListener("click", markAs("done"));
    root.querySelector("#mark-partial-btn")?.addEventListener("click", markAs("partial"));
    root.querySelector("#mark-skipped-btn")?.addEventListener("click", markAs("skipped"));
    root.querySelector("#uncheck-btn")?.addEventListener("click", () => {
      clearCompletion(week.weekNumber, day);
      render(root, ctx);
    });

    // Choix du support d'exécution pour les séances vélo (Niveau 2)
    root.querySelectorAll(".bike-chooser__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        root
          .querySelectorAll(".bike-chooser__btn")
          .forEach((b) => b.classList.remove("bike-chooser__btn--active"));
        btn.classList.add("bike-chooser__btn--active");
        const mode = btn.dataset.mode;
        const advice = root.querySelector("#bike-mode-advice");
        if (!advice) return;
        const messages = {
          indoor:
            "<strong>🏠 Home trainer / vélo d'appart :</strong> respecte la structure précise des blocs ci-dessous. Ventilateur indispensable. Cadence cible = rpm affichés.",
          outdoor:
            "<strong>🌳 Vélo extérieur :</strong> boucle libre à la durée totale. Reste régulier·e sur l'intensité ciblée (RPE 4-5/10 pour endurance, 7-8/10 pour seuil). Évite les arrêts fréquents.",
          "commute-ext":
            "<strong>🚲 Détour vélotaff :</strong> prolonge ton trajet habituel pour atteindre la durée cible. Exemple : 20 km de détour sur un retour de 8 km. Joue avec des boucles dans ton quartier.",
        };
        advice.hidden = false;
        advice.innerHTML = messages[mode] ?? "";
      });
    });

    // Suggestion de parcours via Netlify Function → OpenRouteService
    const suggestBtn = root.querySelector("#suggest-route-btn");
    const newRouteBtn = root.querySelector("#new-route-btn");
    const mapEl2 = root.querySelector(".route-map");
    const statsEl = root.querySelector("#route-stats");
    const errorEl = root.querySelector("#route-error");
    let currentPolyline = null;

    const loadRoute = async (seed) => {
      if (!mapEl2 || !mapEl2._leafletMap) return;
      const L = mapEl2._leafletL;
      const map = mapEl2._leafletMap;

      suggestBtn.disabled = true;
      newRouteBtn.disabled = true;
      const lbl = suggestBtn.querySelector(".route-btn-label");
      if (lbl) lbl.textContent = "Génération…";
      errorEl.hidden = true;

      try {
        const geojson = await fetchRoute({
          session: dayData.session,
          userProfile: profile,
          seed,
        });
        const stats = extractRouteStats(geojson, dayData.session);
        if (!stats) throw new Error("empty_geojson");

        // On stocke le GeoJSON pour l'export GPX
        mapEl2._lastGeojson = geojson;
        mapEl2._lastStats = stats;

        // Supprime l'ancienne polyline + segment côte si présents
        if (currentPolyline) map.removeLayer(currentPolyline);
        if (map._hillLayer) map.removeLayer(map._hillLayer);
        if (map._hillMarker) map.removeLayer(map._hillMarker);

        // Trace la polyline principale en bleu
        const latlngs = stats.coords.map((c) => [c[1], c[0]]);
        currentPolyline = L.polyline(latlngs, {
          color: "#2563eb",
          weight: 4,
          opacity: 0.9,
        }).addTo(map);

        // Si séance de côtes et segment trouvé → trace en rouge par-dessus
        const hill = geojson._hillSegment;
        if (hill) {
          const hillLatLngs = stats.coords
            .slice(hill.startIdx, hill.endIdx + 1)
            .map((c) => [c[1], c[0]]);
          map._hillLayer = L.polyline(hillLatLngs, {
            color: "#dc2626",
            weight: 6,
            opacity: 0.95,
          }).addTo(map);
          // Marqueur au début de la côte
          const startCoord = hillLatLngs[0];
          map._hillMarker = L.marker(startCoord, {
            icon: L.divIcon({
              className: "hill-marker",
              html: '<div class="hill-marker__pin">⛰️</div>',
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            }),
          })
            .addTo(map)
            .bindPopup(
              `<strong>Ta côte</strong><br>${hill.lengthM} m · ${hill.gradient} % de pente<br><em>Fais tes répétitions ici</em>`
            );
        }

        map.fitBounds(currentPolyline.getBounds(), { padding: [10, 10] });

        // Réactive drag/zoom pour explorer le parcours
        map.dragging.enable();
        map.scrollWheelZoom.enable();
        map.doubleClickZoom.enable();

        // Affiche les stats + flag "approximatif" si la tolérance n'est pas atteinte
        statsEl.hidden = false;
        const targetKm = geojson._targetKm;
        const approximate = geojson._approximate;
        const elevPerKm = geojson._elevPerKm ?? 0;
        const elevTarget = geojson._elevTarget;
        const hillInfo = geojson._hillSegment;
        statsEl.innerHTML = `
          <div><strong>${stats.distanceKm}</strong><span>km ${targetKm ? `/ ~${targetKm} cible` : ""}</span></div>
          <div><strong>+${stats.ascent}</strong><span>m D+</span></div>
          <div><strong>−${stats.descent}</strong><span>m D−</span></div>
          <div><strong>${stats.durationMin}</strong><span>min est.</span></div>
          ${hillInfo ? `<div class="hill-info" style="grid-column:1/-1">⛰️ <strong>Côte identifiée</strong> : ${hillInfo.lengthM} m à ${hillInfo.gradient} % (tracé rouge). Fais tes répétitions dessus.</div>` : ""}
          ${dayData.session.family === "hills" && !hillInfo ? `<div class="route-approximate" style="grid-column:1/-1">⚠️ Aucune côte idéale (80-150 m, 5-8 %) trouvée sur ce parcours. Essaie une autre variante, ou choisis une montée de ton choix sur le tracé.</div>` : ""}
          ${approximate && !hillInfo ? `<div class="route-approximate" style="grid-column:1/-1">⚠️ Parcours approximatif (${elevPerKm} m/km, cible ${elevTarget}). Essaie une autre variante pour un meilleur match.</div>` : ""}
        `;

        // Remplace le bouton principal par "Variante" + affiche export
        suggestBtn.hidden = true;
        newRouteBtn.hidden = false;
        const exportEl = root.querySelector("#route-export");
        if (exportEl) exportEl.hidden = false;
        // Ajuste le texte du hint selon la plateforme
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        const stravaHint = root.querySelector("#strava-hint");
        if (stravaHint && isMobile && navigator.canShare) {
          stravaHint.textContent =
            "Choisis Strava dans le menu partage qui s'ouvre. L'app importera la route automatiquement.";
        }
      } catch (err) {
        errorEl.hidden = false;
        const isLocalDev =
          location.hostname === "localhost" ||
          location.hostname === "127.0.0.1";
        const is404 = /^http_404/.test(err.message || "");
        errorEl.textContent =
          err.message === "missing_api_key"
            ? "Service temporairement indisponible — configuration en cours."
            : err.message === "no_location"
            ? "Localisation manquante."
            : err.message === "no_route_for_session_type"
            ? "Pas de parcours pour ce type de séance."
            : is404 && isLocalDev
            ? "ℹ️ API parcours indisponible en local (Vite dev ne sert pas les Netlify Functions). Teste sur le site déployé."
            : is404
            ? "Service parcours indisponible — vérifie que le dernier déploiement est bien publié."
            : `Erreur : ${err.message}`;
        if (lbl) lbl.textContent = "Suggérer un parcours";
      } finally {
        suggestBtn.disabled = false;
        newRouteBtn.disabled = false;
      }
    };

    suggestBtn?.addEventListener("click", () => loadRoute());
    newRouteBtn?.addEventListener("click", () =>
      loadRoute(Math.floor(Math.random() * 1e6))
    );

    // Export GPX : génération + téléchargement du fichier
    const gpxFilename = () => {
      const s = dayData.session;
      const day = DAY_FULL[detailSessionKey.split(":")[1]] ?? "";
      const km = mapEl2._lastStats?.distanceKm ?? "";
      return `runly-S${week.weekNumber}-${day}-${km}km.gpx`
        .replace(/\s+/g, "_")
        .toLowerCase();
    };
    const buildGpxString = () => {
      if (!mapEl2._lastGeojson) return null;
      const s = dayData.session;
      const name = `Runly · ${FAMILY_LABELS[s.family] ?? s.family} · S${week.weekNumber}`;
      const desc = s.intent ?? "";
      return geojsonToGpx(mapEl2._lastGeojson, { name, description: desc });
    };

    root.querySelector("#download-gpx-btn")?.addEventListener("click", () => {
      const gpx = buildGpxString();
      if (!gpx) return;
      downloadGpx(gpx, gpxFilename());
    });

    // Génère un workout Garmin TCX à partir des blocs de la séance
    root.querySelector("#garmin-send-btn")?.addEventListener("click", () => {
      const s = dayData.session;
      const tcx = sessionToTcxWorkout(s);
      const filename = `runly-${s.templateId || "workout"}-s${week.weekNumber}.tcx`.toLowerCase();
      sendToGarminWatch(tcx, filename);
      const hint = root.querySelector("#garmin-hint");
      if (hint) {
        hint.innerHTML =
          "✓ Fichier TCX téléchargé. Sur Garmin Connect (onglet ouvert), clique <strong>Importer</strong> et sélectionne le fichier.";
      }
    });

    // Saisie résultat test VMA → recalcul auto des allures
    root.querySelector("#vma-test-submit")?.addEventListener("click", () => {
      const minEl = root.querySelector("#vma-test-min");
      const secEl = root.querySelector("#vma-test-sec");
      const resultEl = root.querySelector("#vma-test-result");
      const min = Number(minEl.value);
      const sec = Number(secEl.value) || 0;
      if (!min || min < 8 || min > 20) {
        if (resultEl) {
          resultEl.textContent = "⚠️ Temps invalide — un 3000m se court en 8 à 20 minutes.";
          resultEl.style.color = "#b45309";
        }
        return;
      }
      const totalSec = min * 60 + sec;
      // VMA (km/h) = distance_km / temps_h = 3 / (totalSec/3600) = 3 * 3600 / totalSec
      const newVma = Math.round((3 * 3600) / totalSec * 10) / 10;
      updateProfile({
        vma: newVma,
        paceFreshness: "recent",
        paceReferenceDistance: 3,
      });
      if (resultEl) {
        resultEl.innerHTML =
          `✓ <strong>Nouvelle VMA : ${newVma} km/h</strong>. Les allures des semaines suivantes viennent d'être recalculées. Ferme la modale pour voir.`;
        resultEl.style.color = "#166534";
      }
    });

    // Note post-séance : debounced save
    const noteEl = root.querySelector("#session-note");
    if (noteEl) {
      let saveTimer = null;
      const status = root.querySelector("#note-status");
      noteEl.addEventListener("input", () => {
        if (status) status.textContent = "Sauvegarde…";
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          setCompletion(week.weekNumber, day, { note: noteEl.value });
          if (status) status.textContent = "Sauvegardée automatiquement.";
        }, 400);
      });
    }

    // Init mini-carte Leaflet (si localisation connue)
    const mapEl = root.querySelector(".route-map");
    if (mapEl) {
      initMiniMap(mapEl);
    }
  }
}

// Chargement dynamique de Leaflet (lazy) + init de la carte.
async function initMiniMap(el) {
  const lat = Number(el.dataset.lat);
  const lng = Number(el.dataset.lng);
  if (!lat || !lng) return;

  try {
    const L = (await import("leaflet")).default;
    await import("leaflet/dist/leaflet.css");

    // Évite la double-init si déjà instancié
    if (el._leafletMap) return;

    const map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
    }).setView([lat, lng], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    L.circleMarker([lat, lng], {
      radius: 6,
      color: "#2563eb",
      fillColor: "#2563eb",
      fillOpacity: 1,
    }).addTo(map);

    // On expose la map + L sur le node DOM pour les manipuler depuis le handler
    el._leafletMap = map;
    el._leafletL = L;
  } catch (e) {
    console.warn("[Runly] Leaflet indisponible :", e);
    el.innerHTML = '<p class="muted small center">Carte indisponible</p>';
  }
}

// ---------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
