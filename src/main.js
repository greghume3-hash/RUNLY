// Point d'entrée de l'application : on délègue l'affichage
// au router, qui démarre sur l'écran "welcome".

import { render } from "./router.js";

render();

// Enregistre le service worker pour rendre l'app installable (PWA)
// et disponible hors-ligne. On évite en dev local si on est en HTTP pur
// (le SW nécessite HTTPS, ou localhost — Vite dev sert en localhost, OK).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("[Runly] SW enregistré", reg.scope))
      .catch((e) => console.warn("[Runly] SW échec", e));
  });
}
