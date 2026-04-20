// Écran 1/5 du formulaire — Identité (toutes les questions sont optionnelles).

import { navigate } from "../router.js";
import { profile, updateProfile } from "../store.js";

const STEP = 1;
const TOTAL_STEPS = 5;

export function identityScreen(root) {
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
        <h1>Qui es-tu&nbsp;?</h1>
        <p class="lead">
          Ces infos nous aident à calibrer tes séances. Tout est optionnel —
          tu peux tout passer si tu préfères.
        </p>

        <form class="form" id="identity-form" novalidate>
          <label class="field">
            <span class="field__label">
              Prénom <span class="field__hint">(optionnel)</span>
            </span>
            <input
              type="text"
              name="firstName"
              autocomplete="given-name"
              placeholder="Comment on t'appelle ?"
            />
          </label>

          <label class="field">
            <span class="field__label">
              Âge <span class="field__hint">(optionnel)</span>
            </span>
            <input
              type="number"
              name="age"
              inputmode="numeric"
              min="10"
              max="100"
              placeholder="Ton âge"
            />
          </label>

          <fieldset class="field field--chips">
            <legend class="field__label">
              Sexe <span class="field__hint">(optionnel)</span>
            </legend>
            <div class="chip-group">
              <label class="chip">
                <input type="radio" name="sex" value="female" />
                <span>Femme</span>
              </label>
              <label class="chip">
                <input type="radio" name="sex" value="male" />
                <span>Homme</span>
              </label>
              <label class="chip">
                <input type="radio" name="sex" value="other" />
                <span>Autre</span>
              </label>
              <label class="chip">
                <input type="radio" name="sex" value="skip" />
                <span>Je préfère ne pas dire</span>
              </label>
            </div>
          </fieldset>

          <label class="field">
            <span class="field__label">
              Poids <span class="field__hint">(optionnel, en kg)</span>
            </span>
            <input
              type="number"
              name="weight"
              inputmode="decimal"
              min="30"
              max="200"
              placeholder="Ton poids"
            />
          </label>

          <label class="field">
            <span class="field__label">
              Taille <span class="field__hint">(optionnel, en cm)</span>
            </span>
            <input
              type="number"
              name="height"
              inputmode="numeric"
              min="120"
              max="220"
              placeholder="Ex : 175"
            />
          </label>
        </form>
      </section>

      <footer class="screen__footer">
        <button class="btn btn--primary" id="next-btn" type="button">
          Suivant
        </button>
      </footer>
    </main>
  `;

  const form = root.querySelector("#identity-form");

  // Préremplit le formulaire si l'utilisateur a déjà saisi ces valeurs
  if (profile.firstName) form.firstName.value = profile.firstName;
  if (profile.age) form.age.value = profile.age;
  if (profile.sex) {
    const r = form.querySelector(`input[name="sex"][value="${profile.sex}"]`);
    if (r) r.checked = true;
  }
  if (profile.weight) form.weight.value = profile.weight;
  if (profile.height) form.height.value = profile.height;

  root
    .querySelector("#back-btn")
    .addEventListener("click", () => navigate("welcome"));

  root.querySelector("#next-btn").addEventListener("click", () => {
    const data = new FormData(form);
    const firstName = data.get("firstName");
    const age = data.get("age");
    const weight = data.get("weight");

    const height = data.get("height");

    updateProfile({
      firstName: firstName && firstName.trim() ? firstName.trim() : null,
      age: age ? Number(age) : null,
      sex: data.get("sex") || null,
      weight: weight ? Number(weight) : null,
      height: height ? Number(height) : null,
    });

    console.log("[Runly] profil après étape 1 :", { ...profile });
    navigate("level");
  });
}
