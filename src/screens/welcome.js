// Écran d'accueil : présentation + CTA pour lancer le formulaire.

import { navigate } from "../router.js";
import { profile } from "../store.js";

export function welcomeScreen(root) {
  root.innerHTML = `
    <main class="welcome">
      <header class="welcome__header">
        <div class="logo">Runly</div>
      </header>

      <section class="welcome__hero">
        <h1>Ton plan running,<br />fait pour toi.</h1>
        <p class="lead">
          Des séances adaptées à ton niveau, ton emploi du temps
          et ton environnement.
        </p>
      </section>

      <section class="features">
        <article class="feature">
          <div class="feature__icon" aria-hidden="true">📍</div>
          <div>
            <h3>Parcours locaux</h3>
            <p>Des trajets réels près de chez toi.</p>
          </div>
        </article>
        <article class="feature">
          <div class="feature__icon" aria-hidden="true">⚙️</div>
          <div>
            <h3>Ton matériel</h3>
            <p>Home trainer, tapis, vélotaff… on s'adapte.</p>
          </div>
        </article>
        <article class="feature">
          <div class="feature__icon" aria-hidden="true">📅</div>
          <div>
            <h3>Ton rythme</h3>
            <p>On compose avec tes journées, pas l'inverse.</p>
          </div>
        </article>
      </section>

      <footer class="welcome__footer">
        <button class="btn btn--primary" id="start-btn" type="button">
          Créer mon plan
        </button>
        <button class="btn btn--link" id="existing-btn" type="button">
          J'ai déjà un plan
        </button>
      </footer>
    </main>
  `;

  root
    .querySelector("#start-btn")
    .addEventListener("click", () => navigate("identity"));

  root.querySelector("#existing-btn").addEventListener("click", () => {
    // Plan = profil complet en localStorage ; sinon, démarre le formulaire
    if (profile.objectiveType && profile.sessionsPerWeek) {
      navigate("plan");
    } else {
      alert("Pas de plan sauvegardé. Commençons par créer ton profil.");
      navigate("identity");
    }
  });
}
