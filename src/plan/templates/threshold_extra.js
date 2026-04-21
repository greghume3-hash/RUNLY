// Famille "threshold" — templates complémentaires.

// Tempo continu : 20-40 min au seuil sans coupure.
// Séance-clé pour le semi-marathon.
export const thresholdContinuTemplate = {
  id: "threshold-continu",
  type: "tempo",
  family: "threshold",
  name: "Seuil — tempo continu",
  intent:
    "Améliorer la capacité à tenir une allure soutenue sans coupure. Référence pour le semi-marathon.",
  phasesFit: { base: 0.1, development: 0.7, specific: 1.0, taper: 0.5 },
  params: {
    durationMin: { min: 20, max: 40 },
  },
  blockSpecs: [
    { kind: "warmup", minutes: 15, zone: "Z2" },
    {
      kind: "tempo",
      paceContext: "tempo",
      reps: 1,
      durationParam: "durationMin",
    },
    { kind: "cooldown", minutes: 10 },
  ],
  tips: {
    before: "Pas de collation lourde dans l'heure qui précède.",
    during: "Soutenu mais pas maximal. Tu dois pouvoir tenir l'allure jusqu'au bout.",
    after: "Retour au calme + glucides dans les 30 min.",
  },
};

// Fractionné long seuil : 4 × 8 min au seuil.
// Variation plus fractionnée, utile si tu n'es pas encore prêt·e
// pour un tempo continu de 30+ min.
export const thresholdFourBlocksTemplate = {
  id: "threshold-4blocks",
  type: "tempo",
  family: "threshold",
  name: "Seuil — 4 × 8 min",
  intent:
    "Travailler le seuil par fractions plus courtes. Plus accessible qu'un tempo continu.",
  phasesFit: { base: 0.6, development: 1.0, specific: 0.6, taper: 0.9 },
  params: {
    reps: { min: 3, max: 5 },
  },
  blockSpecs: [
    { kind: "warmup", minutes: 15, zone: "Z2" },
    {
      kind: "tempo",
      paceContext: "threshold",
      repsParam: "reps",
      durationMin: 8,
      recoveryMin: 2,
    },
    { kind: "cooldown", minutes: 10 },
  ],
  tips: {
    before: null,
    during: "Les 2 premiers blocs doivent être les plus faciles.",
    after: null,
  },
};
