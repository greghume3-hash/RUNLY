// Famille "specific_pace" : blocs à allure course cible.
// Essentiels en phase spécifique (préparation course).

// Bloc allure marathon : dans une sortie longue.
// Ex : SL de 1h30 dont 30 min à allure marathon.
export const specificMarathonTemplate = {
  id: "specific-marathon-block",
  type: "tempo",
  family: "specific_pace",
  name: "Sortie avec bloc allure marathon",
  intent:
    "Habituer le corps à l'allure marathon dans la fatigue. Séance-clé en phase spécifique.",
  phasesFit: { base: 0.0, development: 0.3, specific: 1.0, taper: 0.3 },
  params: {
    easyWarmupMin: { min: 20, max: 40 },
    paceBlockMin: { min: 20, max: 50 },
    easyCooldownMin: { min: 10, max: 15 },
  },
  blockSpecs: [
    {
      kind: "run",
      paceContext: "standard_easy",
      durationParam: "easyWarmupMin",
      label: "Mise en route",
    },
    {
      kind: "specific_pace",
      paceContext: "marathon_pace",
      durationParam: "paceBlockMin",
    },
    {
      kind: "run",
      paceContext: "recovery",
      durationParam: "easyCooldownMin",
      label: "Retour au calme",
    },
  ],
  tips: {
    before: "Petit-déjeuner 2-3h avant. Gel ou boisson glucidique si > 1h30.",
    during: "Vérifie que l'allure marathon reste confortable jusqu'au bout du bloc.",
    after: "Glucides + protéines dans les 30 min. Étirements légers.",
  },
};

// Bloc allure 10k ou allure semi (au choix selon l'objectif).
export const specific10kTemplate = {
  id: "specific-10k-block",
  type: "tempo",
  family: "specific_pace",
  name: "Bloc allure 10k",
  intent:
    "Simuler l'effort et l'allure de ton objectif 10k. À faire en fin de préparation.",
  phasesFit: { base: 0.0, development: 0.3, specific: 1.0, taper: 0.3 },
  params: {
    reps: { min: 2, max: 4 },
    distanceKm: { min: 1.5, max: 3 },
  },
  blockSpecs: [
    { kind: "warmup", minutes: 15, zone: "Z2" },
    {
      kind: "specific_pace",
      paceContext: "10k_pace",
      distanceParam: "distanceKm",
    },
    { kind: "cooldown", minutes: 10 },
  ],
  tips: {
    before: null,
    during: "Tenir l'allure sans craquer. Apprends à la sentir.",
    after: null,
  },
};
