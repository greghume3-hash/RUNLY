// Écran 3/5 — Ton objectif.
// Champs obligatoires : type d'objectif + deadline (ou "pas de date").
// Champs conditionnels : chrono visé (route + trail), D+ visé (trail uniquement).

import { navigate } from "../router.js";
import { profile, updateProfile } from "../store.js";

const STEP = 3;
const TOTAL_STEPS = 5;

// Catalogue des objectifs. L'ID est la clé, utilisé pour la logique.
// distanceKm : utilisée pour calibrer le plan quand connue.
// category  : "general" (pas de distance cible) | "road" | "trail"
const OBJECTIVES = {
  fitness_restart: { label: "Se (re)mettre au sport", category: "general" },
  weight_loss:     { label: "Perdre du poids",        category: "general" },
  maintain:        { label: "Maintenir la forme",     category: "general" },

  "5k":            { label: "5 km",          category: "road", distanceKm: 5 },
  "10k":           { label: "10 km",         category: "road", distanceKm: 10 },
  half:            { label: "Semi-marathon", category: "road", distanceKm: 21.1 },
  marathon:        { label: "Marathon",      category: "road", distanceKm: 42.2 },

  trail_45:        { label: "Trail 45 km",  category: "trail", distanceKm: 45 },
  trail_60:        { label: "Trail 60 km",  category: "trail", distanceKm: 60 },
  trail_80:        { label: "Trail 80 km",  category: "trail", distanceKm: 80 },
  trail_120:       { label: "Trail 120 km", category: "trail", distanceKm: 120 },
  trail_160:       { label: "Trail 160 km", category: "trail", distanceKm: 160 },
};

const GROUPS = [
  { id: "general", title: "Objectif général" },
  { id: "road",    title: "Course sur route" },
  { id: "trail",   title: "Trail" },
];

function chipsForCategory(category) {
  return Object.entries(OBJECTIVES)
    .filter(([, o]) => o.category === category)
    .map(
      ([key, o]) => `
        <label class="chip">
          <input type="radio" name="objectiveType" value="${key}" />
          <span>${o.label}</span>
        </label>`
    )
    .join("");
}

export function objectiveScreen(root) {
  const todayIso = new Date().toISOString().slice(0, 10);

  root.innerHTML = `
    <main class="screen">
      <header class="screen__header">
        <button class="icon-btn" id="back-btn" type="button" aria-label="Retour">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${TOTAL_STEPS}" aria-valuenow="${STEP}">
          <div class="progress__bar" style="width: ${(STEP / TOTAL_STEPS) * 100}%"></div>
        </div>
        <span class="progress__label">${STEP}/${TOTAL_STEPS}</span>
      </header>

      <section class="screen__body">
        <h1>Ton objectif</h1>
        <p class="lead">Le cap de ton entraînement.</p>

        <form class="form" id="objective-form" novalidate>
          <fieldset class="field" data-field="objectiveType">
            <legend class="field__label">Qu'est-ce que tu vises ?</legend>
            ${GROUPS.map(
              (g) => `
              <div class="objective-group">
                <p class="objective-group__title">${g.title}</p>
                <div class="chip-group">${chipsForCategory(g.id)}</div>
              </div>`
            ).join("")}
          </fieldset>

          <fieldset class="field" data-field="deadline">
            <legend class="field__label">Pour quand ?</legend>
            <input
              type="date"
              name="deadline"
              min="${todayIso}"
            />
            <label class="chip chip--toggle">
              <input type="checkbox" name="noDeadline" />
              <span>Je n'ai pas de date précise</span>
            </label>
          </fieldset>

          <fieldset class="field" id="target-time-field" hidden>
            <legend class="field__label">
              Chrono visé <span class="field__hint">(optionnel)</span>
            </legend>
            <div class="pace-input">
              <input type="number" name="targetHours" inputmode="numeric" min="0" max="30" placeholder="0" aria-label="Heures" />
              <span class="pace-input__sep">h</span>
              <input type="number" name="targetMinutes" inputmode="numeric" min="0" max="59" placeholder="45" aria-label="Minutes" />
              <span class="pace-input__sep">min</span>
              <input type="number" name="targetSeconds" inputmode="numeric" min="0" max="59" placeholder="00" aria-label="Secondes" />
              <span class="pace-input__sep">s</span>
            </div>
            <p class="field__help">Temps cible pour boucler la distance.</p>
          </fieldset>

          <label class="field" id="target-elevation-field" hidden>
            <span class="field__label">
              Dénivelé positif (D+) visé
              <span class="field__hint">(recommandé, en m)</span>
            </span>
            <input
              type="number"
              name="targetElevation"
              inputmode="numeric"
              min="0"
              max="15000"
              step="50"
              placeholder="Ex : 3000"
            />
            <p class="field__help">
              D+ cumulé de ta course. Essentiel pour adapter le plan
              (sorties en côte, renforcement spécifique).
            </p>
          </label>

          <p class="form__error" id="form-error" role="alert" hidden>
            Il manque une info pour continuer.
          </p>
        </form>
      </section>

      <footer class="screen__footer">
        <button class="btn btn--primary" id="next-btn" type="button">
          Suivant
        </button>
      </footer>
    </main>
  `;

  const form = root.querySelector("#objective-form");
  const errorEl = root.querySelector("#form-error");
  const deadlineInput = form.deadline;
  const noDeadlineInput = form.noDeadline;
  const targetTimeField = root.querySelector("#target-time-field");
  const targetElevationField = root.querySelector("#target-elevation-field");

  // Préremplissage depuis le profil existant
  if (profile.objectiveType) {
    const r = form.querySelector(
      `input[name="objectiveType"][value="${profile.objectiveType}"]`
    );
    if (r) r.checked = true;
  }
  if (profile.deadline) deadlineInput.value = profile.deadline;
  if (profile.noDeadline) {
    noDeadlineInput.checked = true;
    deadlineInput.disabled = true;
    deadlineInput.value = "";
  }
  if (profile.targetTimeSeconds != null) {
    const s = profile.targetTimeSeconds;
    form.targetHours.value = Math.floor(s / 3600);
    form.targetMinutes.value = Math.floor((s % 3600) / 60);
    form.targetSeconds.value = s % 60;
  }
  if (profile.targetElevationM != null) {
    form.targetElevation.value = profile.targetElevationM;
  }

  // Affiche/masque chrono et D+ selon la catégorie d'objectif choisie
  const updateConditionalFields = () => {
    const selected = form.querySelector('input[name="objectiveType"]:checked')?.value;
    const cat = selected ? OBJECTIVES[selected].category : null;
    targetTimeField.hidden = !(cat === "road" || cat === "trail");
    targetElevationField.hidden = cat !== "trail";
  };
  updateConditionalFields();
  form.querySelectorAll('input[name="objectiveType"]').forEach((el) => {
    el.addEventListener("change", updateConditionalFields);
  });

  // Couplage deadline <-> "pas de date précise"
  noDeadlineInput.addEventListener("change", () => {
    deadlineInput.disabled = noDeadlineInput.checked;
    if (noDeadlineInput.checked) deadlineInput.value = "";
  });
  deadlineInput.addEventListener("input", () => {
    if (deadlineInput.value) noDeadlineInput.checked = false;
  });

  root
    .querySelector("#back-btn")
    .addEventListener("click", () => navigate("level"));

  root.querySelector("#next-btn").addEventListener("click", () => {
    const data = new FormData(form);
    const objectiveType = data.get("objectiveType");
    const deadline = data.get("deadline");
    const noDeadline = !!data.get("noDeadline");

    const missing = [];
    if (!objectiveType) missing.push("objectiveType");
    if (!deadline && !noDeadline) missing.push("deadline");

    if (missing.length > 0) {
      errorEl.hidden = false;
      form
        .querySelectorAll("[data-field]")
        .forEach((el) => el.classList.remove("field--error"));
      missing.forEach((name) => {
        const el = form.querySelector(`[data-field="${name}"]`);
        if (el) el.classList.add("field--error");
      });
      form
        .querySelector(`[data-field="${missing[0]}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    errorEl.hidden = true;

    const def = OBJECTIVES[objectiveType];
    const h = Number(data.get("targetHours") || 0);
    const m = Number(data.get("targetMinutes") || 0);
    const s = Number(data.get("targetSeconds") || 0);
    const targetTimeSeconds = h * 3600 + m * 60 + s;
    const targetElevation = data.get("targetElevation");

    updateProfile({
      objectiveType,
      objectiveCategory: def.category,
      objectiveDistanceKm: def.distanceKm ?? null,
      deadline: deadline || null,
      noDeadline,
      targetTimeSeconds: targetTimeSeconds > 0 ? targetTimeSeconds : null,
      targetElevationM: targetElevation ? Number(targetElevation) : null,
    });

    console.log("[Runly] profil après étape 3 :", { ...profile });
    navigate("schedule");
  });
}
