// Écran 5/5 — Environnement & santé.
// - Localisation (GPS ou ville, optionnel) pour suggérer des parcours locaux
// - Matériel indoor (optionnel) pour proposer du replacement en cas de météo
// - Terrain préféré (optionnel, masqué pour trail)
// - Blessure en cours (obligatoire — sécurité)

import { navigate } from "../router.js";
import { profile, updateProfile } from "../store.js";

const STEP = 5;
const TOTAL_STEPS = 5;

const EQUIPMENTS = [
  { id: "home_trainer", label: "Home trainer" },
  { id: "treadmill",    label: "Tapis de course" },
  { id: "indoor_bike",  label: "Vélo d'appartement" },
  { id: "rower",        label: "Rameur" },
  { id: "gym_access",   label: "Accès salle" },
];

const TERRAINS = [
  { id: "road",   label: "Route" },
  { id: "path",   label: "Chemins" },
  { id: "track",  label: "Piste" },
  { id: "any",    label: "Peu importe" },
];

export function environmentScreen(root) {
  const hideTerrain = profile.objectiveCategory === "trail";

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
        <h1>Environnement &amp; santé</h1>
        <p class="lead">Dernier écran — on finalise ton profil.</p>

        <form class="form" id="environment-form" novalidate>
          <fieldset class="field">
            <legend class="field__label">
              Ta localisation
              <span class="field__hint">(optionnel)</span>
            </legend>
            <div class="location-search">
              <input
                type="text"
                name="locationCity"
                id="location-input"
                placeholder="Ex : Lyon, 75011, Chamonix…"
                autocomplete="off"
              />
              <ul class="location-suggestions" id="location-suggestions" hidden></ul>
            </div>
            <div class="location-controls">
              <button class="btn btn--outline" id="geolocate-btn" type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg>
                Utiliser ma position GPS
              </button>
              <p class="field__help" id="geo-status" hidden></p>
            </div>
            <p class="field__help">
              Sert à suggérer des parcours réels près de chez toi.
            </p>
          </fieldset>

          <fieldset class="field field--chips">
            <legend class="field__label">
              Matériel disponible
              <span class="field__hint">(optionnel, plusieurs choix)</span>
            </legend>
            <div class="chip-group">
              ${EQUIPMENTS.map(
                (e) => `
                <label class="chip">
                  <input type="checkbox" name="equipment" value="${e.id}" />
                  <span>${e.label}</span>
                </label>`
              ).join("")}
            </div>
            <p class="field__help">
              Sert à proposer une alternative indoor en cas de météo.
            </p>
          </fieldset>

          <fieldset class="field field--chips"${hideTerrain ? ' hidden' : ""} id="terrain-field">
            <legend class="field__label">
              Terrain préféré
              <span class="field__hint">(optionnel)</span>
            </legend>
            <div class="chip-group">
              ${TERRAINS.map(
                (t) => `
                <label class="chip">
                  <input type="radio" name="preferredTerrain" value="${t.id}" />
                  <span>${t.label}</span>
                </label>`
              ).join("")}
            </div>
          </fieldset>

          <fieldset class="field field--chips" data-field="hasInjury">
            <legend class="field__label">Une blessure ou douleur en cours ?</legend>
            <div class="chip-group">
              <label class="chip"><input type="radio" name="hasInjury" value="no" /><span>Non</span></label>
              <label class="chip"><input type="radio" name="hasInjury" value="yes" /><span>Oui</span></label>
            </div>
          </fieldset>

          <label class="field" id="injury-zone-field" hidden>
            <span class="field__label">
              Où ? <span class="field__hint">(décris brièvement)</span>
            </span>
            <textarea
              name="injuryZone"
              rows="2"
              placeholder="Ex : douleur au mollet droit depuis 1 semaine…"
            ></textarea>
            <p class="field__help">
              Tant que tu indiques une blessure active, on privilégiera des
              séances douces et du renforcement ciblé.
            </p>
          </label>

          <p class="form__error" id="form-error" role="alert" hidden>
            Il manque une info pour continuer.
          </p>
        </form>
      </section>

      <footer class="screen__footer">
        <button class="btn btn--primary" id="next-btn" type="button">
          Générer mon plan
        </button>
      </footer>
    </main>
  `;

  const form = root.querySelector("#environment-form");
  const errorEl = root.querySelector("#form-error");
  const injuryZoneField = root.querySelector("#injury-zone-field");
  const geoStatus = root.querySelector("#geo-status");
  const cityInput = form.locationCity;
  const geoBtn = root.querySelector("#geolocate-btn");

  // --- Préremplissage ---
  if (profile.locationCity) cityInput.value = profile.locationCity;
  if (profile.locationLat != null && profile.locationLng != null) {
    geoStatus.hidden = false;
    geoStatus.textContent = `📍 Position détectée (${profile.locationLat.toFixed(3)}, ${profile.locationLng.toFixed(3)})`;
  }
  if (Array.isArray(profile.equipment)) {
    for (const id of profile.equipment) {
      const c = form.querySelector(`input[name="equipment"][value="${id}"]`);
      if (c) c.checked = true;
    }
  }
  if (profile.preferredTerrain) {
    const r = form.querySelector(
      `input[name="preferredTerrain"][value="${profile.preferredTerrain}"]`
    );
    if (r) r.checked = true;
  }
  if (profile.hasInjury) {
    const r = form.querySelector(
      `input[name="hasInjury"][value="${profile.hasInjury}"]`
    );
    if (r) r.checked = true;
    injuryZoneField.hidden = profile.hasInjury !== "yes";
  }
  if (profile.injuryZone) form.injuryZone.value = profile.injuryZone;

  // --- Toggle zone blessure ---
  form.querySelectorAll('input[name="hasInjury"]').forEach((el) => {
    el.addEventListener("change", () => {
      injuryZoneField.hidden = el.value !== "yes";
    });
  });

  // --- Géolocalisation ---
  let tempLat = profile.locationLat ?? null;
  let tempLng = profile.locationLng ?? null;

  // --- Geocoding (Nominatim) : suggestions depuis la saisie texte ---
  const suggestionsEl = root.querySelector("#location-suggestions");
  let searchTimer = null;
  let lastQuery = "";
  cityInput.addEventListener("input", () => {
    const q = cityInput.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) {
      suggestionsEl.hidden = true;
      suggestionsEl.innerHTML = "";
      return;
    }
    searchTimer = setTimeout(async () => {
      if (q === lastQuery) return;
      lastQuery = q;
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const results = await res.json();
        if (results.length === 0) {
          suggestionsEl.hidden = true;
          suggestionsEl.innerHTML = "";
          return;
        }
        suggestionsEl.innerHTML = results
          .map(
            (r, i) =>
              `<li class="location-suggestions__item" data-idx="${i}" data-lat="${r.lat}" data-lng="${r.lng}" data-name="${escapeAttr(r.name)}">${escapeHtml(r.name)}</li>`
          )
          .join("");
        suggestionsEl.hidden = false;

        // Click = sélection
        suggestionsEl.querySelectorAll("li").forEach((li) => {
          li.addEventListener("click", () => {
            tempLat = Number(li.dataset.lat);
            tempLng = Number(li.dataset.lng);
            cityInput.value = li.dataset.name;
            suggestionsEl.hidden = true;
            geoStatus.hidden = false;
            geoStatus.textContent = `📍 Position sélectionnée (${tempLat.toFixed(3)}, ${tempLng.toFixed(3)})`;
          });
        });
      } catch (e) {
        // Silent fail — l'user peut toujours utiliser le GPS
      }
    }, 400);
  });

  // Ferme les suggestions au clic extérieur
  document.addEventListener("click", (e) => {
    if (!cityInput.contains(e.target) && !suggestionsEl.contains(e.target)) {
      suggestionsEl.hidden = true;
    }
  });

  geoBtn.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      geoStatus.hidden = false;
      geoStatus.textContent = "⚠️ Géolocalisation non disponible sur ce navigateur.";
      return;
    }
    geoStatus.hidden = false;
    geoStatus.textContent = "Recherche de ta position…";
    geoBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        tempLat = pos.coords.latitude;
        tempLng = pos.coords.longitude;
        geoStatus.textContent = `📍 Position détectée (${tempLat.toFixed(3)}, ${tempLng.toFixed(3)})`;
        geoBtn.disabled = false;
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Permission refusée. Tu peux saisir une ville à la main."
            : "Impossible de récupérer ta position. Essaie avec une ville.";
        geoStatus.textContent = "⚠️ " + msg;
        geoBtn.disabled = false;
      },
      { timeout: 8000, enableHighAccuracy: false }
    );
  });

  root
    .querySelector("#back-btn")
    .addEventListener("click", () => navigate("schedule"));

  root.querySelector("#next-btn").addEventListener("click", () => {
    const data = new FormData(form);
    const hasInjury = data.get("hasInjury");

    const missing = [];
    if (!hasInjury) missing.push("hasInjury");

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

    const injuryZone = data.get("injuryZone");

    updateProfile({
      locationCity: data.get("locationCity")?.trim() || null,
      locationLat: tempLat,
      locationLng: tempLng,
      equipment: data.getAll("equipment"),
      preferredTerrain: data.get("preferredTerrain") || null,
      hasInjury,
      injuryZone:
        hasInjury === "yes" && injuryZone && injuryZone.trim()
          ? injuryZone.trim()
          : null,
    });

    console.log("[Runly] profil final :", { ...profile });
    navigate("plan");
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll('"', "&quot;");
}
