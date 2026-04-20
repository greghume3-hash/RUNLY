// Écran "dev sandbox" — accessible via ?dev=1.
// Deux onglets : Allures (moteur getPaces) et Séances (générateur).

import { getPaces } from "../plan/paces.js";
import { testProfiles } from "../plan/testProfiles.js";
import { ALL_TEMPLATES, TEMPLATE_FAMILIES, getTemplatesByFamily } from "../plan/templates/index.js";
import { generateSessionFromTemplate } from "../plan/session.js";
import { generateWeek } from "../plan/week.js";
import { generatePlan } from "../plan/periodization.js";

const CONFIDENCE_COLORS = {
  high: "#16a34a",
  medium: "#ca8a04",
  low: "#ea580c",
  estimated: "#dc2626",
};

function sourceLabel(src) {
  if (!src) return "";
  if (src === "direct") return "VMA directe";
  if (src === "estimated_from_profile") return "Estimée depuis le profil";
  const m = src.match(/^derived_from_(.+)k$/);
  if (m) return `Dérivée d'un chrono ${m[1]} km`;
  return src;
}

const TARGET_CONTEXTS = [
  "recovery",
  "standard_easy",
  "long_run_base",
  "long_run_marathon",
  "tempo",
  "threshold",
  "vma_short",
  "vma_long",
  "sprint",
];

let activeTab = "paces";

export function sandboxScreen(root) {
  render(root);
}

function render(root) {
  root.innerHTML = `
    <main class="screen screen--wide">
      <header class="screen__header">
        <div class="logo">🧪 Dev Sandbox</div>
        <span class="progress__label">Runly — algo</span>
      </header>

      <nav class="tabs">
        <button class="tab ${activeTab === "paces" ? "tab--active" : ""}" data-tab="paces">
          Allures (étape 1)
        </button>
        <button class="tab ${activeTab === "sessions" ? "tab--active" : ""}" data-tab="sessions">
          Séances (étape 2)
        </button>
        <button class="tab ${activeTab === "week" ? "tab--active" : ""}" data-tab="week">
          Semaine (étape 3)
        </button>
        <button class="tab ${activeTab === "plan" ? "tab--active" : ""}" data-tab="plan">
          Plan (étape 4)
        </button>
      </nav>

      <section class="screen__body">
        ${
          activeTab === "paces"
            ? renderPacesTab()
            : activeTab === "sessions"
            ? renderSessionsTab()
            : activeTab === "week"
            ? renderWeekTab()
            : renderPlanTab()
        }
      </section>
    </main>
  `;

  root.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      render(root);
    });
  });

  if (activeTab === "sessions") attachSessionsControls(root);
  if (activeTab === "week") attachWeekControls(root);
  if (activeTab === "plan") attachPlanControls(root);
}

// ===================== ONGLET ALLURES =====================

function renderPacesTab() {
  return `
    <p class="lead">
      Résultats du moteur <code>getPaces()</code> pour des profils fictifs.
    </p>
    ${testProfiles.map(renderProfileCard).join("")}
  `;
}

function renderProfileCard(tp) {
  const paces = getPaces(tp.profile);
  return `
    <article class="sandbox-card">
      <header class="sandbox-card__header">
        <h2>${escapeHtml(tp.name)}</h2>
        <span class="badge" style="background:${CONFIDENCE_COLORS[paces.confidence]}">
          ${paces.confidence}
        </span>
      </header>

      <p class="sandbox-card__expected">${escapeHtml(tp.expected)}</p>

      <div class="sandbox-card__meta">
        <div><strong>VMA :</strong> ${paces.vmaKmh} km/h
          <span class="muted">(${sourceLabel(paces.vmaSource)})</span>
        </div>
        ${paces.beginnerAdjusted ? '<div class="muted"><em>Ajustement débutant (-3 %)</em></div>' : ""}
        ${paces.walkRunMode ? '<div class="warn">🚶 Mode walk-run (VMA ≤ 9)</div>' : ""}
        ${paces.needsTest ? `<div class="warn">⚠️ Test VMA recommandé en semaine ${paces.testRecommendedWeek}</div>` : ""}
      </div>

      <details>
        <summary>Profil</summary>
        <pre>${escapeHtml(JSON.stringify(tp.profile, null, 2))}</pre>
      </details>

      <table class="sandbox-table">
        <thead>
          <tr><th>Zone</th><th>% VMA</th><th>Allure min/km</th><th>Vitesse km/h</th></tr>
        </thead>
        <tbody>
          ${Object.entries(paces.zones)
            .map(
              ([key, z]) => `
            <tr>
              <td><strong>${z.short}</strong> <span class="muted">${z.label}</span>
                <span class="z-tag">${key}</span></td>
              <td>${z.vmaPct[0]}–${z.vmaPct[1]} %</td>
              <td>${z.paceMin} – ${z.paceMax}</td>
              <td>${z.kmhMin} – ${z.kmhMax}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>

      <h4>Allures spécifiques course</h4>
      <table class="sandbox-table">
        <tbody>
          ${Object.entries(paces.specificPaces)
            .map(
              ([, sp]) => `
            <tr>
              <td><strong>${sp.label}</strong> <span class="muted">(~${sp.vmaPct} % VMA)</span></td>
              <td>${sp.pace}</td>
              <td>${sp.kmh} km/h</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>

      <h4>Allures cibles par contexte</h4>
      <table class="sandbox-table">
        <tbody>
          ${TARGET_CONTEXTS.map((ctx) => {
            const t = paces.getTargetPace(ctx);
            return `
            <tr>
              <td><strong>${escapeHtml(ctx)}</strong></td>
              <td>${t.vmaPct} %</td>
              <td>${t.pace}/km</td>
              <td>${t.kmh} km/h</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </article>
  `;
}

// ===================== ONGLET SÉANCES =====================

// Profil affiché par défaut (confirmé). Le user peut switcher.
let sessionActiveProfileIdx = 0;
let sessionActiveFamily = TEMPLATE_FAMILIES[0];

function renderSessionsTab() {
  const tp = testProfiles[sessionActiveProfileIdx];
  const paces = getPaces(tp.profile);
  const templates = getTemplatesByFamily(sessionActiveFamily);

  return `
    <p class="lead">
      Bibliothèque de <strong>${ALL_TEMPLATES.length} templates</strong>
      répartis en <strong>${TEMPLATE_FAMILIES.length} familles</strong>.
      Sélectionne un profil et une famille pour voir les séances générées.
    </p>

    <div class="sandbox-controls">
      <label>
        <span class="muted">Profil :</span>
        <select id="profile-select">
          ${testProfiles
            .map(
              (p, i) =>
                `<option value="${i}" ${i === sessionActiveProfileIdx ? "selected" : ""}>${escapeHtml(p.name)}</option>`
            )
            .join("")}
        </select>
      </label>
      <label>
        <span class="muted">Famille :</span>
        <select id="family-select">
          ${TEMPLATE_FAMILIES.map(
            (f) =>
              `<option value="${f}" ${f === sessionActiveFamily ? "selected" : ""}>${f} (${getTemplatesByFamily(f).length})</option>`
          ).join("")}
        </select>
      </label>
    </div>

    <article class="sandbox-card">
      <header class="sandbox-card__header">
        <h2>${escapeHtml(tp.name)}</h2>
        <span class="badge" style="background:${CONFIDENCE_COLORS[paces.confidence]}">
          VMA ${paces.vmaKmh} km/h · ${paces.confidence}
        </span>
      </header>
      <p class="sandbox-card__expected muted">Famille <strong>${sessionActiveFamily}</strong> — ${templates.length} template(s)</p>

      ${templates
        .map((template) => {
          const session = generateSessionFromTemplate({
            template,
            profile: tp.profile,
            paces,
            context: { week: 4, day: "wednesday" },
          });
          return renderSession(session, template);
        })
        .join("")}
    </article>
  `;
}

// Hook les selects après render
function attachSessionsControls(root) {
  const ps = root.querySelector("#profile-select");
  const fs = root.querySelector("#family-select");
  if (ps)
    ps.addEventListener("change", (e) => {
      sessionActiveProfileIdx = Number(e.target.value);
      render(root);
    });
  if (fs)
    fs.addEventListener("change", (e) => {
      sessionActiveFamily = e.target.value;
      render(root);
    });
}

function renderSession(session, template) {
  return `
    <section class="session-card">
      <header class="session-card__header">
        <div>
          <h3>${escapeHtml(template.name)}</h3>
          <p class="muted">${escapeHtml(session.intent)}</p>
        </div>
        <div class="session-card__stats">
          <span class="stat">${session.totalDurationMin} min</span>
          <span class="stat stat--${session.difficulty}">${session.difficulty}</span>
          <span class="stat">load ${session.estimatedLoad}</span>
        </div>
      </header>

      <ol class="blocks">
        ${session.blocks.map(renderBlock).join("")}
      </ol>

      ${renderTips(session.tips)}

      <details>
        <summary>JSON complet</summary>
        <pre>${escapeHtml(JSON.stringify(session, null, 2))}</pre>
      </details>
    </section>
  `;
}

function renderBlock(block) {
  if (block.type === "warmup" || block.type === "cooldown") {
    return `
      <li class="block block--${block.type}">
        <strong>${escapeHtml(block.label)}</strong> — ${block.durationMin} min
        ${block.paceTarget ? `<span class="muted">(${block.paceTarget.min}–${block.paceTarget.max}/km · ${block.speedTarget.min}–${block.speedTarget.max} km/h)</span>` : ""}
        <div class="muted">${escapeHtml(block.description ?? "")}</div>
      </li>`;
  }
  if (block.type === "drills") {
    return `
      <li class="block block--drills">
        <strong>${escapeHtml(block.label)}</strong>
        ${block.optional ? '<span class="badge-tag">optionnel</span>' : ""}
        — ${block.durationMin} min
        <div class="muted">${escapeHtml(block.description ?? "")}</div>
      </li>`;
  }
  if (block.type === "intervals" && block.sequence) {
    // Séquence (pyramide, etc.)
    const stepsHtml = block.sequence
      .map((s) => {
        const label = s.workDistanceM
          ? `${s.workDistanceM} m`
          : `${s.workSec}s`;
        const rec = s.recoverySec ? ` <span class="muted">· r ${s.recoverySec}s</span>` : "";
        return `<li>${label}${rec}</li>`;
      })
      .join("");
    const seriesNote =
      block.repetitions > 1
        ? `<div><strong>${block.repetitions} séries</strong> (récup ${block.betweenSeriesRecoveryMin} min entre séries)</div>`
        : "";
    return `
      <li class="block block--intervals">
        <strong>Séquence</strong> — ${escapeHtml(block.sequenceSummary ?? "")}
        ${seriesNote}
        <ol class="sequence-steps">${stepsHtml}</ol>
        <div class="muted">${escapeHtml(block.description ?? "")}</div>
        ${block.tips ? `<div class="muted"><em>💡 ${escapeHtml(block.tips)}</em></div>` : ""}
      </li>`;
  }
  if (block.type === "intervals") {
    const w = block.work ?? {};
    // Support distance OU temps
    const dur =
      w.distance != null
        ? `${block.repetitions} × ${w.distance} m`
        : w.durationSec != null
        ? `${block.repetitions} × ${w.durationSec}s`
        : `${block.repetitions} répétitions`;
    const pace =
      w.paceTarget && w.speedTarget
        ? `à ${w.paceTarget.value}/km <span class="muted">(${w.speedTarget.value} km/h${w.timeTarget ? ` · ${w.timeTarget.value} ${w.timeTarget.unit}` : ""})</span>`
        : w.speedTarget
        ? `<span class="muted">(${w.speedTarget.value} ${w.speedTarget.unit})</span>`
        : "";
    const rec = block.recovery
      ? block.recovery.durationSec != null
        ? `Récup : ${block.recovery.durationSec}s ${block.recovery.type === "walk" ? "marche" : block.recovery.type === "walk_down" ? "redescente" : "trottinée"}`
        : block.recovery.durationMin != null
        ? `Récup : ${block.recovery.durationMin} min`
        : ""
      : "";
    return `
      <li class="block block--intervals">
        <strong>${dur}</strong> ${pace}
        ${rec ? `<div>${rec}</div>` : ""}
        <div class="muted">${escapeHtml(block.description ?? "")}</div>
        ${block.tips ? `<div class="muted"><em>💡 ${escapeHtml(block.tips)}</em></div>` : ""}
      </li>`;
  }
  if (block.type === "tempo") {
    // Deux cas : bloc structuré avec work (tempo, specific_pace),
    // ou bloc libre avec juste durationMin (fartlek).
    const w = block.work;
    if (!w && block.durationMin) {
      return `
        <li class="block block--tempo">
          <strong>${escapeHtml(block.label ?? "Bloc")}</strong> — ${block.durationMin} min
          <div class="muted">${escapeHtml(block.description ?? "")}</div>
        </li>`;
    }
    const ww = w ?? {};
    const head =
      ww.durationMin != null
        ? `${block.repetitions ?? 1} × ${ww.durationMin} min`
        : ww.distanceKm != null
        ? `${ww.distanceKm} km`
        : "Bloc";
    const pace = ww.paceTarget && ww.speedTarget
      ? `à ${ww.paceTarget.value}/km <span class="muted">(${ww.speedTarget.value} km/h)</span>`
      : "";
    return `
      <li class="block block--tempo">
        <strong>${head}</strong> ${pace}
        ${block.recovery?.durationMin ? `<div>Récup : ${block.recovery.durationMin} min trottinée</div>` : ""}
        <div class="muted">${escapeHtml(block.description ?? "")}</div>
      </li>`;
  }
  if (block.type === "easy" || block.type === "recovery") {
    const pace =
      block.paceTarget?.value && block.speedTarget?.value
        ? `à ${block.paceTarget.value}/km <span class="muted">(${block.speedTarget.value} km/h)</span>`
        : "";
    return `
      <li class="block block--easy">
        <strong>${escapeHtml(block.label ?? "Footing")}</strong> — ${block.durationMin} min ${pace}
        <div class="muted">${escapeHtml(block.description ?? "")}</div>
      </li>`;
  }
  if (block.type === "cross") {
    return `
      <li class="block block--easy">
        <strong>${escapeHtml(block.label ?? "Cross")}</strong> — ${block.durationMin} min
        <div class="muted">${escapeHtml(block.description ?? "")}</div>
      </li>`;
  }
  return `<li class="block">${escapeHtml(JSON.stringify(block).slice(0, 200))}</li>`;
}

function renderTips(tips) {
  if (!tips) return "";
  const items = [];
  if (tips.before) items.push(`<li><strong>Avant :</strong> ${escapeHtml(tips.before)}</li>`);
  if (tips.during) items.push(`<li><strong>Pendant :</strong> ${escapeHtml(tips.during)}</li>`);
  if (tips.after) items.push(`<li><strong>Après :</strong> ${escapeHtml(tips.after)}</li>`);
  if (items.length === 0) return "";
  return `<ul class="tips">${items.join("")}</ul>`;
}

// ===================== ONGLET SEMAINE =====================

// Profils enrichis avec les champs nécessaires à generateWeek()
// (on étend les testProfiles qui sont focalisés sur le moteur d'allures).
const WEEK_TEST_PROFILES = testProfiles.map((tp, i) => {
  // Quelques réglages par défaut si le profil de base n'a pas tout
  const extras = [
    // 0 : confirmé
    { sessionsPerWeek: 5, availableDays: ["mon","tue","wed","thu","fri","sat","sun"], longRunDay: "sun", maxSessionWeekday: 75, maxSessionWeekend: 180 },
    // 1 : intermédiaire
    { sessionsPerWeek: 4, availableDays: ["mon","tue","thu","sat","sun"], longRunDay: "sat", maxSessionWeekday: 60, maxSessionWeekend: 120, commuteDays: ["mon","thu"], commuteDistanceKm: 8 },
    // 2 : chrono semi
    { sessionsPerWeek: 4, availableDays: ["mon","wed","fri","sun"], longRunDay: "sun", maxSessionWeekday: 70, maxSessionWeekend: 150 },
    // 3 : débutante
    { sessionsPerWeek: 3, availableDays: ["tue","thu","sat"], longRunDay: "sat", maxSessionWeekday: 45, maxSessionWeekend: 75 },
    // 4 : profil vide
    { sessionsPerWeek: 2, availableDays: ["wed","sun"], longRunDay: "sun", maxSessionWeekday: 30, maxSessionWeekend: 45 },
    // 5 : walk-run sénior
    { sessionsPerWeek: 2, availableDays: ["mon","thu"], longRunDay: "any", maxSessionWeekday: 30 },
    // 6 : traileur
    { sessionsPerWeek: 5, availableDays: ["mon","tue","wed","thu","fri","sat","sun"], longRunDay: "sun", maxSessionWeekday: 75, maxSessionWeekend: 240, commuteDays: ["mon","wed","fri"], commuteDistanceKm: 12, commuteElevationM: 150 },
  ];
  return { ...tp, profile: { ...tp.profile, ...(extras[i] ?? {}) } };
});

let weekActiveProfileIdx = 0;
let weekNumberIdx = 1;

const DAY_FR = {
  mon: "Lundi", tue: "Mardi", wed: "Mercredi",
  thu: "Jeudi", fri: "Vendredi", sat: "Samedi", sun: "Dimanche",
};

function renderWeekTab() {
  const tp = WEEK_TEST_PROFILES[weekActiveProfileIdx];
  const paces = getPaces(tp.profile);
  // On génère 4 semaines consécutives pour visualiser la rotation
  const weeks = [];
  let hist = {};
  for (let w = 1; w <= 4; w++) {
    const week = generateWeek({
      profile: tp.profile,
      paces,
      weekNumber: w,
      history: hist,
    });
    weeks.push(week);
    hist = week.history;
  }
  const week = weeks[weekNumberIdx - 1] ?? weeks[0];
  return `
    <p class="lead">
      Semaine type générée via <code>generateWeek()</code>. Les séances
      sont placées selon les dispos, le vélotaff et la règle hard/easy.
    </p>
    <div class="sandbox-controls">
      <label>
        <span class="muted">Profil :</span>
        <select id="week-profile-select">
          ${WEEK_TEST_PROFILES.map(
            (p, i) =>
              `<option value="${i}" ${i === weekActiveProfileIdx ? "selected" : ""}>${escapeHtml(p.name)}</option>`
          ).join("")}
        </select>
      </label>
      <label>
        <span class="muted">Semaine :</span>
        <select id="week-number-select">
          ${[1, 2, 3, 4]
            .map(
              (w) =>
                `<option value="${w}" ${w === weekNumberIdx ? "selected" : ""}>Semaine ${w}</option>`
            )
            .join("")}
        </select>
      </label>
    </div>

    <div class="rotation-overview">
      <strong>Vue rotation sur 4 semaines :</strong>
      ${weeks
        .map((wk, idx) => {
          const qualities = Object.values(wk.days)
            .filter((d) => d.type === "session" && d.session.family !== "easy" && d.session.family !== "recovery" && d.session.family !== "long")
            .map((d) => d.session.templateId);
          const longT = Object.values(wk.days).find((d) => d.type === "session" && d.session.family === "long")?.session.templateId;
          return `<div class="rotation-row"><span class="stat">S${idx + 1}</span> Qualités : <code>${qualities.join(", ") || "—"}</code> · SL : <code>${longT ?? "—"}</code></div>`;
        })
        .join("")}
    </div>

    <article class="sandbox-card">
      <header class="sandbox-card__header">
        <h2>${escapeHtml(tp.name)}</h2>
        <span class="badge" style="background:${CONFIDENCE_COLORS[paces.confidence]}">
          VMA ${paces.vmaKmh} km/h
        </span>
      </header>

      <div class="sandbox-card__meta">
        <div><strong>Dispos :</strong> ${(tp.profile.availableDays ?? []).map(d => DAY_FR[d]).join(", ") || "—"}</div>
        <div><strong>Séances/sem :</strong> ${tp.profile.sessionsPerWeek ?? "—"}
          · <strong>SL préférée :</strong> ${tp.profile.longRunDay ? DAY_FR[tp.profile.longRunDay] ?? tp.profile.longRunDay : "—"}</div>
        ${(tp.profile.commuteDays ?? []).length ? `<div><strong>Vélotaff :</strong> ${tp.profile.commuteDays.map(d => DAY_FR[d]).join(", ")} · ${tp.profile.commuteDistanceKm ?? "?"} km A/S</div>` : ""}
      </div>

      <h4>Vue calendrier</h4>
      <div class="week-grid">
        ${DAYS_ORDER_WEEK.map((d) => renderWeekDay(d, week.days[d])).join("")}
      </div>

      <h4>Stats semaine</h4>
      <div class="week-stats">
        <span class="stat">${week.stats.sessionCount} séances</span>
        <span class="stat">${week.stats.totalMin} min</span>
        <span class="stat">load course ${week.stats.totalLoad}</span>
        ${week.stats.commuteLoad ? `<span class="stat">load vélotaff ${week.stats.commuteLoad}</span><span class="stat"><strong>total ${week.stats.combinedLoad}</strong></span>` : ""}
        ${week.stats.qualityDays.length ? `<span class="stat">qualité : ${week.stats.qualityDays.map(d => DAY_FR[d].slice(0,3)).join(", ")}</span>` : ""}
        ${week.stats.longRunDay ? `<span class="stat">SL : ${DAY_FR[week.stats.longRunDay]}</span>` : ""}
      </div>

      <details>
        <summary>Séances détaillées</summary>
        ${DAYS_ORDER_WEEK.filter((d) => week.days[d]?.type === "session")
          .map((d) => `
            <h5 style="margin:16px 0 6px 0">${DAY_FR[d]}</h5>
            ${renderSession(week.days[d].session, { name: week.days[d].session.templateId, intent: week.days[d].session.intent })}
          `)
          .join("")}
      </details>
    </article>
  `;
}

const DAYS_ORDER_WEEK = ["mon","tue","wed","thu","fri","sat","sun"];

function renderWeekDay(day, data) {
  if (!data) return "";
  const isRest = data.type === "rest";
  const commuteIcon = data.commute ? ' <span title="Vélotaff">🚴</span>' : "";
  if (isRest) {
    return `
      <div class="week-day week-day--rest">
        <div class="week-day__name">${DAY_FR[day]}${commuteIcon}</div>
        <div class="week-day__body muted">Repos</div>
      </div>`;
  }
  const s = data.session;
  const famColor = {
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
  }[s.family] ?? "#64748b";
  return `
    <div class="week-day" style="border-left-color:${famColor}">
      <div class="week-day__name">${DAY_FR[day]}${commuteIcon}${data.downgraded ? ' <span title="Downgradé depuis quality">⚠️</span>' : ""}</div>
      <div class="week-day__body">
        <div class="week-day__title">${escapeHtml(s.family)}</div>
        <div class="muted">${s.totalDurationMin} min · ${s.difficulty}</div>
      </div>
    </div>`;
}

function attachWeekControls(root) {
  const ps = root.querySelector("#week-profile-select");
  if (ps)
    ps.addEventListener("change", (e) => {
      weekActiveProfileIdx = Number(e.target.value);
      render(root);
    });
  const ws = root.querySelector("#week-number-select");
  if (ws)
    ws.addEventListener("change", (e) => {
      weekNumberIdx = Number(e.target.value);
      render(root);
    });
}

// ===================== ONGLET PLAN =====================

// Profils enrichis avec un objectif daté pour générer un plan complet.
const PLAN_PROFILES = [
  {
    name: "Semi en 12 semaines (VMA 14.5)",
    profile: {
      ...WEEK_TEST_PROFILES[1].profile,
      objectiveType: "half",
      objectiveCategory: "road",
      objectiveDistanceKm: 21.1,
      deadline: new Date(Date.now() + 12 * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      noDeadline: false,
    },
  },
  {
    name: "10 km en 8 semaines (débutante)",
    profile: {
      ...WEEK_TEST_PROFILES[3].profile,
      objectiveType: "10k",
      objectiveCategory: "road",
      objectiveDistanceKm: 10,
      deadline: new Date(Date.now() + 8 * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      noDeadline: false,
    },
  },
  {
    name: "Marathon en 18 semaines (confirmé)",
    profile: {
      ...WEEK_TEST_PROFILES[0].profile,
      objectiveType: "marathon",
      objectiveCategory: "road",
      objectiveDistanceKm: 42.2,
      deadline: new Date(Date.now() + 18 * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      noDeadline: false,
    },
  },
  {
    name: "Trail 80 km en 20 semaines",
    profile: {
      ...WEEK_TEST_PROFILES[6].profile,
      objectiveType: "trail_80",
      objectiveCategory: "trail",
      objectiveDistanceKm: 80,
      targetElevationM: 3500,
      deadline: new Date(Date.now() + 20 * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      noDeadline: false,
    },
  },
  {
    name: "Remise au sport sans deadline",
    profile: {
      ...WEEK_TEST_PROFILES[4].profile,
      objectiveType: "fitness_restart",
      objectiveCategory: "general",
      objectiveDistanceKm: null,
      deadline: null,
      noDeadline: true,
    },
  },
];

let planActiveProfileIdx = 0;

const PHASE_COLORS = {
  base:         { bg: "#dbeafe", fg: "#1e40af", label: "Base" },
  development:  { bg: "#dcfce7", fg: "#166534", label: "Développement" },
  specific:     { bg: "#fef3c7", fg: "#92400e", label: "Spécifique" },
  taper:        { bg: "#fce7f3", fg: "#9f1239", label: "Affûtage" },
};

const ACWR_COLORS = {
  green:  "#16a34a",
  yellow: "#ca8a04",
  red:    "#dc2626",
};

function renderPlanTab() {
  const tp = PLAN_PROFILES[planActiveProfileIdx];
  const paces = getPaces(tp.profile);
  const plan = generatePlan({ profile: tp.profile, paces });

  // Volume max pour dessiner la "courbe" proportionnelle
  const maxVol = Math.max(...plan.weeks.map((_, i) => plan.volumePlan.targets[i].km));

  return `
    <p class="lead">
      Plan complet généré par <code>generatePlan()</code>.
      Structure : base → développement → spécifique → affûtage.
    </p>
    <div class="sandbox-controls">
      <label>
        <span class="muted">Profil :</span>
        <select id="plan-profile-select">
          ${PLAN_PROFILES.map(
            (p, i) =>
              `<option value="${i}" ${i === planActiveProfileIdx ? "selected" : ""}>${escapeHtml(p.name)}</option>`
          ).join("")}
        </select>
      </label>
    </div>

    <article class="sandbox-card">
      <header class="sandbox-card__header">
        <h2>${escapeHtml(tp.name)}</h2>
        <span class="badge" style="background:${CONFIDENCE_COLORS[paces.confidence]}">
          VMA ${paces.vmaKmh} km/h
        </span>
      </header>

      <div class="sandbox-card__meta">
        <div><strong>${plan.weeksCount} semaines</strong> · ${plan.volumePlan.startVolume} km/sem au départ → progression ${Math.round(plan.volumePlan.progressionRate * 100)} %/sem</div>
        <div><strong>Phases :</strong> ${plan.phases.map((p) => `${PHASE_COLORS[p.name].label} (${p.weeks} sem)`).join(" · ")}</div>
      </div>

      <h4>Vue macro — semaine par semaine</h4>
      <table class="plan-table">
        <thead>
          <tr>
            <th>S</th>
            <th>Phase</th>
            <th>Volume cible</th>
            <th>Séances</th>
            <th>Charge totale</th>
            <th>ACWR</th>
            <th>Qualités</th>
          </tr>
        </thead>
        <tbody>
          ${plan.weeks
            .map((w, i) => {
              const target = plan.volumePlan.targets[i];
              const phase = PHASE_COLORS[w.phase];
              const acwr = plan.acwrHistory[i];
              const qualities = Object.values(w.days)
                .filter(
                  (d) =>
                    d.type === "session" &&
                    d.session.family !== "easy" &&
                    d.session.family !== "recovery" &&
                    d.session.family !== "long" &&
                    d.session.family !== "cross"
                )
                .map((d) => d.session.family);
              const barWidth = Math.round((target.km / maxVol) * 100);
              return `
                <tr ${target.isDeload ? 'class="row--deload"' : ""}>
                  <td>${w.weekNumber}</td>
                  <td><span class="phase-pill" style="background:${phase.bg};color:${phase.fg}">${phase.label}</span></td>
                  <td>
                    <div class="volume-bar">
                      <div class="volume-bar__fill" style="width:${barWidth}%"></div>
                      <span>${target.km} km${target.isDeload ? " · allègement" : ""}</span>
                    </div>
                  </td>
                  <td>${w.stats.sessionCount}</td>
                  <td>${w.stats.combinedLoad}</td>
                  <td><span class="acwr" style="background:${ACWR_COLORS[acwr.zone]}">${acwr.ratio}</span></td>
                  <td class="muted" style="font-size:12px">${qualities.join(", ") || "—"}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>

      <details>
        <summary>Détail JSON du plan</summary>
        <pre>${escapeHtml(JSON.stringify({ ...plan, weeks: "[...]", acwrHistory: plan.acwrHistory }, null, 2))}</pre>
      </details>
    </article>
  `;
}

function attachPlanControls(root) {
  const ps = root.querySelector("#plan-profile-select");
  if (ps)
    ps.addEventListener("change", (e) => {
      planActiveProfileIdx = Number(e.target.value);
      render(root);
    });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
