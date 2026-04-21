// Template pilote — Seuil en 2 blocs (ex: 2×15 min au seuil).
// Structure : échauffement + blocs tempo au seuil + retour au calme.

export const thresholdTwoBlocksTemplate = {
  id: "threshold-2blocks",
  type: "tempo",
  family: "threshold",
  name: "Seuil — 2 blocs",
  intent:
    "Améliorer ta capacité à tenir une allure soutenue longtemps. Clé pour la performance sur 10k / semi.",
  phasesFit: { base: 0.5, development: 1.0, specific: 0.8, taper: 0.4 },
  params: {
    reps: { min: 2, max: 3 },           // 2 ou 3 blocs
    durationMin: { min: 10, max: 15 },  // 10 à 15 min par bloc
  },
  blockSpecs: [
    { kind: "warmup", minutes: 15, zone: "Z2" },
    {
      kind: "tempo",
      paceContext: "threshold",
      repsParam: "reps",
      durationParam: "durationMin",
      recoveryMin: 3,
    },
    { kind: "cooldown", minutes: 10 },
  ],
  tips: {
    before:
      "Assure-toi d'avoir bien récupéré de la séance précédente. Repas léger 2-3 h avant.",
    during:
      "Soutenu mais tenable. Tu dois pouvoir dire 3-4 mots, pas une phrase complète.",
    after:
      "Retour au calme OBLIGATOIRE. Hydratation + glucides dans l'heure qui suit.",
  },
};
