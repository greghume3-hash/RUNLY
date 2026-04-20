// Écran 2/5 — Ton niveau de course.
// Champs obligatoires : expérience, fréquence, niveau d'activité.
// Champs optionnels : distance max déjà courue, allure sur 5/10 km.

import { navigate } from "../router.js";
import { profile, updateProfile } from "../store.js";

const STEP = 2;
const TOTAL_STEPS = 5;

export function levelScreen(root) {
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
        <h1>Ton niveau de course</h1>
        <p class="lead">
          Ces infos servent à doser l'intensité des séances — pas à juger.
        </p>

        <div class="connect">
          <p class="connect__title">Gagner du temps : importer tes stats</p>
          <div class="connect__buttons">
            <button class="btn-connect" id="connect-strava" type="button">
              <span class="btn-connect__brand" style="--brand:#fc4c02">Strava</span>
              <span class="btn-connect__label">Connecter mon compte</span>
              <span class="btn-connect__badge">Bientôt</span>
            </button>
            <button class="btn-connect" id="connect-garmin" type="button">
              <span class="btn-connect__brand" style="--brand:#000000">Garmin</span>
              <span class="btn-connect__label">Connecter mon compte</span>
              <span class="btn-connect__badge">Bientôt</span>
            </button>
          </div>
        </div>

        <div class="separator"><span>ou remplis à la main</span></div>

        <form class="form" id="level-form" novalidate>
          <fieldset class="field field--chips" data-field="experience">
            <legend class="field__label">Depuis quand tu cours ?</legend>
            <div class="chip-group">
              <label class="chip"><input type="radio" name="experience" value="none" /><span>Jamais vraiment</span></label>
              <label class="chip"><input type="radio" name="experience" value="lt6m" /><span>&lt; 6 mois</span></label>
              <label class="chip"><input type="radio" name="experience" value="6m-2y" /><span>6 mois – 2 ans</span></label>
              <label class="chip"><input type="radio" name="experience" value="2y+" /><span>Plus de 2 ans</span></label>
            </div>
          </fieldset>

          <fieldset class="field field--chips" data-field="frequency">
            <legend class="field__label">Combien de sorties par semaine en ce moment ?</legend>
            <div class="chip-group">
              <label class="chip"><input type="radio" name="frequency" value="0" /><span>0</span></label>
              <label class="chip"><input type="radio" name="frequency" value="1" /><span>1</span></label>
              <label class="chip"><input type="radio" name="frequency" value="2" /><span>2</span></label>
              <label class="chip"><input type="radio" name="frequency" value="3+" /><span>3 ou +</span></label>
            </div>
          </fieldset>

          <label class="field">
            <span class="field__label">
              Volume moyen par semaine
              <span class="field__hint">(optionnel, en km)</span>
            </span>
            <input
              type="number"
              name="weeklyVolumeKm"
              inputmode="decimal"
              min="0"
              max="200"
              step="1"
              placeholder="Ex : 20"
            />
            <p class="field__help">
              Kilométrage hebdo approximatif sur les dernières semaines.
            </p>
          </label>

          <label class="field">
            <span class="field__label">
              Distance la plus longue déjà courue
              <span class="field__hint">(optionnel, en km)</span>
            </span>
            <input
              type="number"
              name="maxDistance"
              inputmode="decimal"
              min="0"
              max="200"
              step="0.5"
              placeholder="Ex : 10"
            />
          </label>

          <fieldset class="field" data-field="pace">
            <legend class="field__label">
              Allure actuelle de course
              <span class="field__hint">(optionnel)</span>
            </legend>
            <div class="pace-input">
              <input
                type="number"
                name="paceMin"
                inputmode="numeric"
                min="2"
                max="15"
                placeholder="5"
                aria-label="Minutes par km"
              />
              <span class="pace-input__sep">min</span>
              <input
                type="number"
                name="paceSec"
                inputmode="numeric"
                min="0"
                max="59"
                placeholder="30"
                aria-label="Secondes par km"
              />
              <span class="pace-input__sep">s / km</span>
            </div>
            <p class="field__help">
              Pas sûr·e ? Laisse vide — on utilisera ton niveau d'activité ci-dessous.
            </p>

            <div class="field__sub" id="pace-freshness" hidden>
              <span class="field__label field__label--sub">
                Sur quelle distance ?
              </span>
              <div class="chip-group">
                <label class="chip"><input type="radio" name="paceReferenceDistance" value="5" /><span>5 km</span></label>
                <label class="chip"><input type="radio" name="paceReferenceDistance" value="10" /><span>10 km</span></label>
                <label class="chip"><input type="radio" name="paceReferenceDistance" value="21.1" /><span>Semi</span></label>
                <label class="chip"><input type="radio" name="paceReferenceDistance" value="42.2" /><span>Marathon</span></label>
              </div>

              <span class="field__label field__label--sub">
                Ce chrono date de quand ?
              </span>
              <div class="chip-group">
                <label class="chip"><input type="radio" name="paceFreshness" value="recent" /><span>Ce mois-ci</span></label>
                <label class="chip"><input type="radio" name="paceFreshness" value="lt6m" /><span>&lt; 6 mois</span></label>
                <label class="chip"><input type="radio" name="paceFreshness" value="older" /><span>Plus ancien</span></label>
              </div>
            </div>
          </fieldset>

          <label class="field">
            <span class="field__label">
              VMA <span class="field__hint">(optionnel, en km/h)</span>
            </span>
            <input
              type="number"
              name="vma"
              inputmode="decimal"
              min="8"
              max="25"
              step="0.1"
              placeholder="Ex : 14"
            />
            <p class="field__help">
              Vitesse Maximale Aérobie — si tu l'as mesurée lors d'un test.
            </p>
          </label>

          <fieldset class="field field--chips" data-field="activityLevel">
            <legend class="field__label">Ton niveau d'activité général</legend>
            <div class="chip-group">
              <label class="chip"><input type="radio" name="activityLevel" value="sedentary" /><span>Sédentaire</span></label>
              <label class="chip"><input type="radio" name="activityLevel" value="light" /><span>Un peu actif</span></label>
              <label class="chip"><input type="radio" name="activityLevel" value="active" /><span>Actif</span></label>
              <label class="chip"><input type="radio" name="activityLevel" value="very_active" /><span>Très actif</span></label>
            </div>
          </fieldset>

          <label class="field">
            <span class="field__label">
              Zones sensibles ou blessures passées
              <span class="field__hint">(optionnel)</span>
            </span>
            <textarea
              name="sensitiveZones"
              rows="2"
              placeholder="Ex : genou droit fragile, tendinite d'Achille 2024…"
            ></textarea>
            <p class="field__help">
              Utile pour éviter les séances qui stressent une zone à risque.
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

  const form = root.querySelector("#level-form");
  const errorEl = root.querySelector("#form-error");

  // Préremplir depuis le profil existant
  if (profile.experience) {
    const r = form.querySelector(`input[name="experience"][value="${profile.experience}"]`);
    if (r) r.checked = true;
  }
  if (profile.frequency) {
    const r = form.querySelector(`input[name="frequency"][value="${profile.frequency}"]`);
    if (r) r.checked = true;
  }
  if (profile.weeklyVolumeKm != null) form.weeklyVolumeKm.value = profile.weeklyVolumeKm;
  if (profile.maxDistance != null) form.maxDistance.value = profile.maxDistance;
  if (profile.paceSecondsPerKm != null) {
    form.paceMin.value = Math.floor(profile.paceSecondsPerKm / 60);
    form.paceSec.value = profile.paceSecondsPerKm % 60;
  }
  if (profile.paceFreshness) {
    const r = form.querySelector(`input[name="paceFreshness"][value="${profile.paceFreshness}"]`);
    if (r) r.checked = true;
  }
  // Distance de référence : 10 km par défaut si allure renseignée sans précision
  if (profile.paceReferenceDistance) {
    const r = form.querySelector(
      `input[name="paceReferenceDistance"][value="${profile.paceReferenceDistance}"]`
    );
    if (r) r.checked = true;
  } else if (profile.paceSecondsPerKm) {
    form.querySelector(
      'input[name="paceReferenceDistance"][value="10"]'
    ).checked = true;
  }
  if (profile.vma != null) form.vma.value = profile.vma;
  if (profile.sensitiveZones) form.sensitiveZones.value = profile.sensitiveZones;

  // Le sous-bloc "date du chrono" ne s'affiche que si l'utilisateur
  // a saisi une allure (min ou sec).
  const freshnessBlock = root.querySelector("#pace-freshness");
  const updateFreshnessVisibility = () => {
    const hasPace = !!(form.paceMin.value || form.paceSec.value);
    freshnessBlock.hidden = !hasPace;
  };
  updateFreshnessVisibility();
  form.paceMin.addEventListener("input", updateFreshnessVisibility);
  form.paceSec.addEventListener("input", updateFreshnessVisibility);
  if (profile.activityLevel) {
    const r = form.querySelector(`input[name="activityLevel"][value="${profile.activityLevel}"]`);
    if (r) r.checked = true;
  }

  root.querySelector("#back-btn").addEventListener("click", () => navigate("identity"));

  // Connexions tierces — stubbées pour l'instant (requiert un backend OAuth)
  const stubConnect = (service) => () => {
    alert(
      `Connexion ${service} — bientôt disponible 🚧\n\n` +
        `Cette fonctionnalité nécessite une authentification OAuth avec un serveur, ` +
        `qui sera ajoutée en V2. Pour l'instant, remplis tes infos ci-dessous.`
    );
  };
  root.querySelector("#connect-strava").addEventListener("click", stubConnect("Strava"));
  root.querySelector("#connect-garmin").addEventListener("click", stubConnect("Garmin"));

  root.querySelector("#next-btn").addEventListener("click", () => {
    const data = new FormData(form);
    const experience = data.get("experience");
    const frequency = data.get("frequency");
    const activityLevel = data.get("activityLevel");

    // Validation : 3 champs obligatoires
    const missing = [];
    if (!experience) missing.push("experience");
    if (!frequency) missing.push("frequency");
    if (!activityLevel) missing.push("activityLevel");

    if (missing.length > 0) {
      errorEl.hidden = false;
      // Surligne les champs manquants
      form.querySelectorAll("[data-field]").forEach((el) => {
        el.classList.remove("field--error");
      });
      missing.forEach((name) => {
        const el = form.querySelector(`[data-field="${name}"]`);
        if (el) el.classList.add("field--error");
      });
      // Scroll vers le premier champ manquant
      const firstMissing = form.querySelector(`[data-field="${missing[0]}"]`);
      firstMissing?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    errorEl.hidden = true;

    // Allure : on la convertit en secondes/km si saisie
    const paceMin = data.get("paceMin");
    const paceSec = data.get("paceSec");
    const paceSecondsPerKm =
      paceMin || paceSec
        ? (Number(paceMin) || 0) * 60 + (Number(paceSec) || 0)
        : null;

    const maxDistance = data.get("maxDistance");
    const weeklyVolumeKm = data.get("weeklyVolumeKm");
    const vma = data.get("vma");
    const sensitiveZones = data.get("sensitiveZones");

    const paceRefDistance = data.get("paceReferenceDistance");

    updateProfile({
      experience,
      frequency,
      activityLevel,
      weeklyVolumeKm: weeklyVolumeKm ? Number(weeklyVolumeKm) : null,
      maxDistance: maxDistance ? Number(maxDistance) : null,
      paceSecondsPerKm,
      paceFreshness: paceSecondsPerKm ? data.get("paceFreshness") || null : null,
      paceReferenceDistance: paceSecondsPerKm
        ? Number(paceRefDistance) || 10
        : null,
      vma: vma ? Number(vma) : null,
      sensitiveZones: sensitiveZones && sensitiveZones.trim() ? sensitiveZones.trim() : null,
    });

    console.log("[Runly] profil après étape 2 :", { ...profile });
    navigate("objective");
  });
}
