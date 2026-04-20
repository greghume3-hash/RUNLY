// Écran 4/5 — Tes dispos (jours, volume, sortie longue).

import { navigate } from "../router.js";
import { profile, updateProfile } from "../store.js";

const STEP = 4;
const TOTAL_STEPS = 5;

const DAYS = [
  { id: "mon", label: "L", full: "Lundi" },
  { id: "tue", label: "M", full: "Mardi" },
  { id: "wed", label: "M", full: "Mercredi" },
  { id: "thu", label: "J", full: "Jeudi" },
  { id: "fri", label: "V", full: "Vendredi" },
  { id: "sat", label: "S", full: "Samedi" },
  { id: "sun", label: "D", full: "Dimanche" },
];

export function scheduleScreen(root) {
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
        <h1>Tes dispos</h1>
        <p class="lead">Le plan s'adaptera à tes contraintes hebdo.</p>

        <form class="form" id="schedule-form" novalidate>
          <fieldset class="field field--chips" data-field="sessionsPerWeek">
            <legend class="field__label">
              Combien de séances par semaine tu peux t'engager à faire ?
            </legend>
            <div class="chip-group">
              <label class="chip"><input type="radio" name="sessionsPerWeek" value="2" /><span>2</span></label>
              <label class="chip"><input type="radio" name="sessionsPerWeek" value="3" /><span>3</span></label>
              <label class="chip"><input type="radio" name="sessionsPerWeek" value="4" /><span>4</span></label>
              <label class="chip"><input type="radio" name="sessionsPerWeek" value="5" /><span>5</span></label>
              <label class="chip"><input type="radio" name="sessionsPerWeek" value="6" /><span>6</span></label>
            </div>
          </fieldset>

          <fieldset class="field field--chips" data-field="availableDays">
            <legend class="field__label">Sur quels jours tu es dispo ?</legend>
            <div class="chip-group chip-group--days" id="available-days">
              ${DAYS.map(
                (d) => `
                <label class="chip chip--day" title="${d.full}">
                  <input type="checkbox" name="availableDays" value="${d.id}" />
                  <span>${d.label}</span>
                </label>`
              ).join("")}
            </div>
            <p class="field__help" id="days-hint">
              Coche au moins autant de jours que de séances choisies au-dessus.
            </p>
          </fieldset>

          <fieldset class="field field--chips" data-field="longRunDay" id="long-run-field" hidden>
            <legend class="field__label">Jour préféré pour la sortie longue</legend>
            <div class="chip-group" id="long-run-choices"></div>
            <p class="field__help">
              Généralement le week-end, mais tu choisis ce qui t'arrange.
            </p>
          </fieldset>

          <label class="field">
            <span class="field__label">
              Durée max d'une séance en semaine
              <span class="field__hint">(optionnel, en min)</span>
            </span>
            <input
              type="number"
              name="maxSessionWeekday"
              inputmode="numeric"
              min="15"
              max="240"
              step="5"
              placeholder="Ex : 60"
            />
          </label>

          <label class="field">
            <span class="field__label">
              Durée max d'une séance le week-end
              <span class="field__hint">(optionnel, en min)</span>
            </span>
            <input
              type="number"
              name="maxSessionWeekend"
              inputmode="numeric"
              min="30"
              max="480"
              step="10"
              placeholder="Ex : 120"
            />
            <p class="field__help">
              Sert à caler la sortie longue (elle peut être plus longue le week-end).
            </p>
          </label>

          <section class="form__section">
            <h3>Vélotaff <span class="field__hint">(optionnel)</span></h3>
            <p class="field__help">
              Le trajet quotidien en vélo ajoute de la charge — on l'intègre
              pour ne pas sur-entraîner.
            </p>

            <fieldset class="field field--chips">
              <legend class="field__label">Jours de vélotaff</legend>
              <div class="chip-group chip-group--days">
                ${DAYS.map(
                  (d) => `
                  <label class="chip chip--day" title="${d.full}">
                    <input type="checkbox" name="commuteDays" value="${d.id}" />
                    <span>${d.label}</span>
                  </label>`
                ).join("")}
              </div>
            </fieldset>

            <label class="field">
              <span class="field__label">
                Distance aller simple
                <span class="field__hint">(en km)</span>
              </span>
              <input
                type="number"
                name="commuteDistanceKm"
                inputmode="decimal"
                min="0"
                max="100"
                step="0.5"
                placeholder="Ex : 8"
              />
            </label>

            <label class="field">
              <span class="field__label">
                D+ aller simple
                <span class="field__hint">(en m)</span>
              </span>
              <input
                type="number"
                name="commuteElevationM"
                inputmode="numeric"
                min="0"
                max="2000"
                step="10"
                placeholder="Ex : 80"
              />
              <p class="field__help">
                Pas sûr·e ? Laisse vide — on estimera à 10 m/km.
              </p>
            </label>

            <fieldset class="field field--chips" id="commute-mode-field">
              <legend class="field__label">Rôle du vélotaff dans ton plan</legend>
              <div class="chip-group">
                <label class="chip">
                  <input type="radio" name="commuteMode" value="complement" />
                  <span>En plus de ma course</span>
                </label>
                <label class="chip">
                  <input type="radio" name="commuteMode" value="replace" />
                  <span>Remplace la course ces jours-là</span>
                </label>
              </div>
              <p class="field__help">
                <strong>En plus</strong> : tu cours quand même (footing léger ces jours).
                <strong>Remplace</strong> : le vélotaff EST ta séance de cross — pas de course ce jour.
              </p>
            </fieldset>
          </section>

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

  const form = root.querySelector("#schedule-form");
  const errorEl = root.querySelector("#form-error");
  const longRunField = root.querySelector("#long-run-field");
  const longRunChoices = root.querySelector("#long-run-choices");
  const daysHint = root.querySelector("#days-hint");

  // --- Préremplissage ---
  if (profile.sessionsPerWeek) {
    const r = form.querySelector(
      `input[name="sessionsPerWeek"][value="${profile.sessionsPerWeek}"]`
    );
    if (r) r.checked = true;
  }
  if (Array.isArray(profile.availableDays)) {
    for (const id of profile.availableDays) {
      const c = form.querySelector(`input[name="availableDays"][value="${id}"]`);
      if (c) c.checked = true;
    }
  }
  if (profile.maxSessionWeekday != null)
    form.maxSessionWeekday.value = profile.maxSessionWeekday;
  if (profile.maxSessionWeekend != null)
    form.maxSessionWeekend.value = profile.maxSessionWeekend;
  if (Array.isArray(profile.commuteDays)) {
    for (const id of profile.commuteDays) {
      const c = form.querySelector(`input[name="commuteDays"][value="${id}"]`);
      if (c) c.checked = true;
    }
  }
  if (profile.commuteDistanceKm != null)
    form.commuteDistanceKm.value = profile.commuteDistanceKm;
  if (profile.commuteElevationM != null)
    form.commuteElevationM.value = profile.commuteElevationM;
  // Default commuteMode = complement (si vélotaff renseigné mais jamais choisi)
  const modeToSet = profile.commuteMode ?? "complement";
  const modeRadio = form.querySelector(
    `input[name="commuteMode"][value="${modeToSet}"]`
  );
  if (modeRadio) modeRadio.checked = true;

  // --- Logique "jour de sortie longue" ---
  // Les chips s'affichent seulement à partir des jours cochés ci-dessus.
  const refreshLongRunChoices = () => {
    const selectedIds = [
      ...form.querySelectorAll('input[name="availableDays"]:checked'),
    ].map((el) => el.value);

    longRunField.hidden = selectedIds.length === 0;
    if (selectedIds.length === 0) {
      longRunChoices.innerHTML = "";
      return;
    }

    longRunChoices.innerHTML = selectedIds
      .map((id) => {
        const day = DAYS.find((d) => d.id === id);
        return `
          <label class="chip">
            <input type="radio" name="longRunDay" value="${id}" />
            <span>${day.full}</span>
          </label>`;
      })
      .join("") +
      `<label class="chip">
         <input type="radio" name="longRunDay" value="any" />
         <span>Au choix</span>
       </label>`;

    // Re-cocher la valeur existante si toujours disponible
    const toKeep = profile.longRunDay;
    if (toKeep) {
      const stillHere = longRunChoices.querySelector(
        `input[value="${toKeep}"]`
      );
      if (stillHere) stillHere.checked = true;
    }
  };
  refreshLongRunChoices();

  // Chaque toggle de jour met à jour la liste des choix de sortie longue
  form.querySelectorAll('input[name="availableDays"]').forEach((el) => {
    el.addEventListener("change", refreshLongRunChoices);
  });

  // Indice visuel sur "coche au moins X jours"
  const updateDaysHint = () => {
    const session = Number(
      form.querySelector('input[name="sessionsPerWeek"]:checked')?.value || 0
    );
    const days = form.querySelectorAll('input[name="availableDays"]:checked')
      .length;
    if (session > 0 && days > 0 && days < session) {
      daysHint.textContent = `Il te faut ${session} jours dispo (tu en as coché ${days}).`;
      daysHint.style.color = "#b91c1c";
    } else {
      daysHint.textContent =
        "Coche au moins autant de jours que de séances choisies au-dessus.";
      daysHint.style.color = "";
    }
  };
  form
    .querySelectorAll(
      'input[name="sessionsPerWeek"], input[name="availableDays"]'
    )
    .forEach((el) => el.addEventListener("change", updateDaysHint));
  updateDaysHint();

  root
    .querySelector("#back-btn")
    .addEventListener("click", () => navigate("objective"));

  root.querySelector("#next-btn").addEventListener("click", () => {
    const data = new FormData(form);
    const sessionsPerWeek = data.get("sessionsPerWeek");
    const availableDays = data.getAll("availableDays");

    const missing = [];
    if (!sessionsPerWeek) missing.push("sessionsPerWeek");
    if (availableDays.length === 0) missing.push("availableDays");

    // Validation croisée : assez de jours pour le nb de séances choisi
    if (
      sessionsPerWeek &&
      availableDays.length > 0 &&
      availableDays.length < Number(sessionsPerWeek)
    ) {
      missing.push("availableDays");
    }

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

    const maxSessionWeekday = data.get("maxSessionWeekday");
    const maxSessionWeekend = data.get("maxSessionWeekend");
    const commuteDays = data.getAll("commuteDays");
    const commuteDistanceKm = data.get("commuteDistanceKm");
    const commuteElevationM = data.get("commuteElevationM");
    const commuteMode = data.get("commuteMode") || "complement";

    updateProfile({
      sessionsPerWeek: Number(sessionsPerWeek),
      availableDays,
      longRunDay: data.get("longRunDay") || null,
      maxSessionWeekday: maxSessionWeekday ? Number(maxSessionWeekday) : null,
      maxSessionWeekend: maxSessionWeekend ? Number(maxSessionWeekend) : null,
      commuteDays,
      commuteDistanceKm: commuteDistanceKm ? Number(commuteDistanceKm) : null,
      commuteElevationM: commuteElevationM ? Number(commuteElevationM) : null,
      commuteMode,
    });

    console.log("[Runly] profil après étape 4 :", { ...profile });
    navigate("environment");
  });
}
