// Moteur d'allures (étape 1 de l'algo).
// À partir d'un profil utilisateur, produit :
//   - une VMA (mesurée, dérivée ou estimée) avec un niveau de confiance
//   - les zones d'entraînement Z1 → Z5c (% VMA, min/km, km/h)
//   - les allures spécifiques course (marathon, semi, 10k, 5k)
//   - un helper getTargetPaceInZone pour choisir une allure cible intelligente
//     selon le contexte (SL marathon, récup, seuil, etc.)
//   - un flag walkRunMode pour les VMA très basses
//
// Références : Billat / Campus Coach / FFA (voir memory/algo_training_plan.md).

// ---------- Table des zones ----------
const ZONE_DEFS = {
  Z1:  { label: "Récupération",            short: "Récup",  vmaPct: [50, 60] },
  Z2:  { label: "Endurance fondamentale",  short: "EF",     vmaPct: [65, 75] },
  Z3:  { label: "Endurance active",        short: "EA",     vmaPct: [75, 85] },
  Z4:  { label: "Seuil",                   short: "Seuil",  vmaPct: [85, 92] },
  Z5a: { label: "VMA courte",              short: "VMA",    vmaPct: [95, 100] },
  Z5b: { label: "VMA longue",              short: "VMA+",   vmaPct: [100, 105] },
  Z5c: { label: "Survitesse",              short: "Sprint", vmaPct: [105, 110] },
};

// ---------- Allures spécifiques (cibles course) ----------
const SPECIFIC_PACE_DEFS = {
  marathon: { label: "Allure marathon", vmaPct: 82.5 },
  semi:     { label: "Allure semi",     vmaPct: 86.5 },
  "10k":    { label: "Allure 10k",      vmaPct: 91.5 },
  "5k":     { label: "Allure 5k",       vmaPct: 96 },
};

// ---------- Contextes de cible dans une zone ----------
// Au lieu de tirer au milieu d'une zone, le générateur de séance choisit
// une allure cible précise selon ce qu'il veut générer.
const TARGET_PCT_BY_CONTEXT = {
  recovery:            55,   // Z1 bas — décrassage
  standard_easy:       70,   // Z2 mid-low — footing standard
  long_run_base:       68,   // Z2 bas — SL "longue tranquille"
  long_run_marathon:   72,   // Z2 haut — SL marathon (on pousse un peu)
  marathon_pace:       82.5, // cible course marathon
  semi_pace:           86.5, // cible course semi
  "10k_pace":          91.5, // cible course 10k
  "5k_pace":           96,   // cible course 5k
  tempo:               87,   // Z4 bas — bloc tempo
  threshold:           90,   // Z4 mid — seuil pur
  vma_short:           97,   // Z5a — intervalles courts type 400-1000m
  vma_long:            102,  // Z5b — intervalles longs type 1000-2000m
  sprint:              107,  // Z5c — foulées, côtes courtes
};

// ---------- Table ratio VMA selon la distance de référence ----------
// % VMA moyen tenu sur une course de distance donnée (Mercier/Léger/FFA).
// Utilisé pour dériver la VMA depuis un chrono de course.
function getVmaRatioForDistance(km) {
  if (km <= 3)    return 0.97;
  if (km <= 5)    return 0.95;
  if (km <= 10)   return 0.92;
  if (km <= 15)   return 0.90;
  if (km <= 21.1) return 0.87;
  if (km <= 30)   return 0.83;
  return 0.81; // marathon et au-delà
}

// ---------- Helpers de conversion ----------
function kmhFromPct(vmaKmh, pct) {
  return vmaKmh * (pct / 100);
}
function secPerKmFromKmh(kmh) {
  return Math.round(3600 / kmh);
}
function formatPace(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function round1(x) {
  return Math.round(x * 10) / 10;
}

// ---------- Dérivation de la VMA ----------

// Depuis une allure de course (sec/km) et la distance parcourue (km).
function vmaFromRacePace(paceSecondsPerKm, raceKm) {
  const kmh = 3600 / paceSecondsPerKm;
  return kmh / getVmaRatioForDistance(raceKm);
}

// Estimation depuis le profil (dernier recours).
// Prend en compte : experience, weeklyVolumeKm, activityLevel, age, sex, IMC.
function estimateVmaFromProfile(profile) {
  const expBase = {
    none:    10,
    lt6m:    12,
    "6m-2y": 13.5,
    "2y+":   15,
  };
  let vma = expBase[profile.experience] ?? 11;

  // Volume hebdo actuel — signal fort si renseigné
  const vol = profile.weeklyVolumeKm ?? 0;
  if (vol >= 50) vma += 1.5;
  else if (vol >= 30) vma += 0.8;
  else if (vol >= 15) vma += 0.3;
  else if (vol === 0 && profile.weeklyVolumeKm !== null) vma -= 0.3;

  // Activité générale
  const byActivity = {
    sedentary:   -1.5,
    light:       -0.5,
    active:       0,
    very_active:  0.8,
  };
  vma += byActivity[profile.activityLevel] ?? 0;

  // Âge (paliers plutôt que linéaire — plus robuste)
  if (profile.age != null) {
    if (profile.age >= 55) vma -= 1;
    else if (profile.age >= 45) vma -= 0.5;
    else if (profile.age < 25) vma += 0.3;
  }

  // Sexe
  if (profile.sex === "female") vma -= 1;

  // IMC (si poids ET taille renseignés)
  if (profile.weight && profile.height) {
    const heightM = profile.height / 100;
    const bmi = profile.weight / (heightM * heightM);
    if (bmi >= 28)       vma -= 1;
    else if (bmi >= 25)  vma -= 0.4;
    else if (bmi < 18)   vma -= 0.3;
  }

  // Plancher à 8 km/h : en dessous on bascule "walk-run" (géré ailleurs)
  return round1(Math.max(8, Math.min(18, vma)));
}

// ---------- API publique ----------

export function getPaces(profile) {
  let vmaKmh = null;
  let vmaSource = null;
  let confidence = "estimated";
  let referenceDistance = null; // km — renseigné si source = derived_from_race

  // --- Cascade de dérivation ---
  if (profile.vma) {
    vmaKmh = round1(profile.vma);
    vmaSource = "direct";
    confidence =
      profile.paceFreshness === "recent" || profile.paceFreshness === "lt6m"
        ? "high"
        : "medium";
  } else if (profile.paceSecondsPerKm) {
    // Distance de référence : champ dédié, 10 km par défaut
    referenceDistance = profile.paceReferenceDistance || 10;
    vmaKmh = round1(
      vmaFromRacePace(profile.paceSecondsPerKm, referenceDistance)
    );
    vmaSource = `derived_from_${referenceDistance}k`;
    confidence =
      profile.paceFreshness === "recent" || profile.paceFreshness === "lt6m"
        ? "medium"
        : "low";
  } else {
    vmaKmh = estimateVmaFromProfile(profile);
    vmaSource = "estimated_from_profile";
    confidence = "estimated";
  }

  const needsTest = confidence !== "high";

  // --- Mode walk-run si la VMA estimée est vraiment basse ---
  // En dessous de ~9 km/h de VMA, les zones VMA deviennent irréalistes.
  // L'appli doit proposer du walk-run progressif plutôt que des zones classiques.
  const walkRunMode = vmaKmh <= 9;

  // --- Ajustement débutants (-3 % sur toutes les zones) ---
  const isBeginner =
    profile.experience === "none" ||
    profile.experience === "lt6m" ||
    (profile.weeklyVolumeKm ?? Infinity) < 20;
  const adjMultiplier = isBeginner ? 0.97 : 1.0;

  // --- Zones (affichage) ---
  const zones = {};
  for (const [key, def] of Object.entries(ZONE_DEFS)) {
    const loPct = def.vmaPct[0] * adjMultiplier;
    const hiPct = def.vmaPct[1] * adjMultiplier;
    const kmhLo = kmhFromPct(vmaKmh, loPct);
    const kmhHi = kmhFromPct(vmaKmh, hiPct);
    const paceMaxSec = secPerKmFromKmh(kmhLo);
    const paceMinSec = secPerKmFromKmh(kmhHi);
    zones[key] = {
      label: def.label,
      short: def.short,
      vmaPct: [Math.round(loPct * 10) / 10, Math.round(hiPct * 10) / 10],
      paceMin: formatPace(paceMinSec),
      paceMax: formatPace(paceMaxSec),
      paceMinSec,
      paceMaxSec,
      kmhMin: round1(kmhLo),
      kmhMax: round1(kmhHi),
    };
  }

  // --- Allures spécifiques (cibles course) ---
  const specificPaces = {};
  for (const [key, def] of Object.entries(SPECIFIC_PACE_DEFS)) {
    const pct = def.vmaPct * adjMultiplier;
    const kmh = kmhFromPct(vmaKmh, pct);
    const paceSec = secPerKmFromKmh(kmh);
    specificPaces[key] = {
      label: def.label,
      vmaPct: Math.round(pct * 10) / 10,
      pace: formatPace(paceSec) + "/km",
      paceSec,
      kmh: round1(kmh),
    };
  }

  // --- Helper : allure cible pour un contexte donné ---
  // Le générateur de séance appellera getTargetPace("long_run_marathon")
  // au lieu de tirer au milieu d'une zone.
  const getTargetPace = (context) => {
    const basePct = TARGET_PCT_BY_CONTEXT[context];
    if (basePct == null) {
      throw new Error(`[paces] contexte inconnu : ${context}`);
    }
    const pct = basePct * adjMultiplier;
    const kmh = kmhFromPct(vmaKmh, pct);
    const paceSec = secPerKmFromKmh(kmh);
    return {
      context,
      vmaPct: Math.round(pct * 10) / 10,
      pace: formatPace(paceSec),
      paceSec,
      kmh: round1(kmh),
    };
  };

  return {
    confidence,
    vmaKmh,
    vmaSource,
    referenceDistance,
    beginnerAdjusted: isBeginner,
    walkRunMode,
    zones,
    specificPaces,
    getTargetPace,
    needsTest,
    testRecommendedWeek: needsTest ? 2 : null,
  };
}

// Helpers exportés pour réutilisation
export const internals = {
  formatPace,
  secPerKmFromKmh,
  kmhFromPct,
  getVmaRatioForDistance,
  TARGET_PCT_BY_CONTEXT,
};
