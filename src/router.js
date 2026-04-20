// Router minimal : chaque "écran" est une fonction qui reçoit
// un élément racine et y dessine son contenu.

import { welcomeScreen } from "./screens/welcome.js";
import { identityScreen } from "./screens/identity.js";
import { levelScreen } from "./screens/level.js";
import { objectiveScreen } from "./screens/objective.js";
import { scheduleScreen } from "./screens/schedule.js";
import { environmentScreen } from "./screens/environment.js";
import { planScreen } from "./screens/plan.js";
import { historyScreen } from "./screens/history.js";
import { sandboxScreen } from "./screens/sandbox.js";

const screens = {
  welcome: welcomeScreen,
  identity: identityScreen,
  level: levelScreen,
  objective: objectiveScreen,
  schedule: scheduleScreen,
  environment: environmentScreen,
  plan: planScreen,
  history: historyScreen,
  sandbox: sandboxScreen,
};

// On démarre sur le sandbox si l'URL contient ?dev=1
const params = new URLSearchParams(location.search);
let currentScreen = params.get("dev") === "1" ? "sandbox" : "welcome";

export function navigate(screenName) {
  if (!screens[screenName]) {
    console.warn(`[Runly] écran inconnu : ${screenName}`);
    return;
  }
  currentScreen = screenName;
  render();
}

export function render() {
  const app = document.getElementById("app");
  const screenFn = screens[currentScreen];
  app.innerHTML = "";
  screenFn(app);
  // On revient en haut de page à chaque changement d'écran
  window.scrollTo({ top: 0, behavior: "instant" });
}
