// Store : garde le profil utilisateur en mémoire et le synchronise
// avec localStorage pour qu'il persiste si on recharge la page.

const STORAGE_KEY = "runly:profile";
const COMPLETIONS_KEY = "runly:completions";

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Objet profil partagé par tous les écrans.
export const profile = loadFromStorage();

export function saveProfile() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

// Fusionne de nouvelles valeurs dans le profil + persiste.
export function updateProfile(patch) {
  Object.assign(profile, patch);
  saveProfile();
}

export function clearProfile() {
  for (const k of Object.keys(profile)) delete profile[k];
  localStorage.removeItem(STORAGE_KEY);
}

// -------------------------------------------------------------------
// Complétions des séances
// Stockées séparément du profil car elles suivent un cycle de vie
// différent (le profil reste stable, les complétions s'accumulent).
//
// Clé = "w{weekNumber}:{day}" (ex: "w3:tue")
// Valeur = { status, note?, doneAt }
//   status : "done" | "skipped" | "partial"
// -------------------------------------------------------------------
function loadCompletions() {
  try {
    const raw = localStorage.getItem(COMPLETIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export const completions = loadCompletions();

function saveCompletions() {
  localStorage.setItem(COMPLETIONS_KEY, JSON.stringify(completions));
}

export function sessionKey(weekNumber, day) {
  return `w${weekNumber}:${day}`;
}

export function getCompletion(weekNumber, day) {
  return completions[sessionKey(weekNumber, day)] ?? null;
}

export function setCompletion(weekNumber, day, patch) {
  const key = sessionKey(weekNumber, day);
  const prev = completions[key] ?? {};
  completions[key] = {
    ...prev,
    ...patch,
    doneAt: patch.status ? new Date().toISOString() : prev.doneAt,
  };
  saveCompletions();
}

export function clearCompletion(weekNumber, day) {
  delete completions[sessionKey(weekNumber, day)];
  saveCompletions();
}
