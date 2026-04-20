// Famille "long" — templates de sortie longue pour varier.

// SL progressive : démarre lent, finit à allure soutenue.
export const longProgressiveTemplate = {
  id: "long-progressive",
  type: "long",
  family: "long",
  name: "Sortie longue progressive",
  intent:
    "Apprendre à gérer une allure croissante sur longue durée — clé pour le marathon et au-delà.",
  params: {
    durationMin: { min: 60, max: 120 },
  },
  blockSpecs: [
    {
      kind: "progressive",
      durationParam: "durationMin",
    },
  ],
  tips: {
    before: "Petit-déjeuner 2-3h avant. Hydratation + glucides.",
    during: "Progression linéaire : le dernier tiers doit être le plus rapide.",
    after: "Re-alimentation dans les 30 min. Étirements doux.",
  },
};

// SL avec bloc allure marathon intégré (pour prépa marathon).
export const longWithMarathonBlockTemplate = {
  id: "long-with-marathon-block",
  type: "long",
  family: "long",
  name: "Sortie longue avec bloc allure marathon",
  intent:
    "Habituer le corps à l'allure marathon en fin de sortie, quand la fatigue pointe. Séance clé en phase spécifique marathon.",
  params: {
    easyMin: { min: 30, max: 60 },
    paceMin: { min: 15, max: 40 },
  },
  blockSpecs: [
    {
      kind: "run",
      paceContext: "long_run_base",
      durationParam: "easyMin",
      label: "Base lente",
    },
    {
      kind: "specific_pace",
      paceContext: "marathon_pace",
      durationParam: "paceMin",
    },
    {
      kind: "run",
      paceContext: "recovery",
      minutes: 5,
      label: "Retour au calme",
    },
  ],
  tips: {
    before: "Gel ou barre glucidique 30 min avant le bloc allure.",
    during: "Allure marathon = soutenu mais tenable sur 42 km. Vérifie que tu pourrais tenir plus longtemps.",
    after: "Re-alimentation immédiate. Récup 24-48 h avant la prochaine dure.",
  },
};

// SL en nature (trail / chemins)
export const longTrailTemplate = {
  id: "long-trail",
  type: "long",
  family: "long",
  name: "Sortie longue nature",
  intent:
    "Travailler l'endurance sur terrain varié. Pour les traileurs et pour changer de la route.",
  params: {
    durationMin: { min: 75, max: 180 },
  },
  blockSpecs: [
    {
      kind: "run",
      paceContext: "long_run_base",
      durationParam: "durationMin",
      label: "Sortie longue nature",
    },
  ],
  tips: {
    before: "Prévois de quoi boire et manger si > 1h30. Reconnaissance du parcours recommandée.",
    during: "Adapte l'allure au terrain. En montée, reste patient·e.",
    after: "Étirements + glucides. Bain froid bénéfique si tu en as un sous la main.",
  },
};
