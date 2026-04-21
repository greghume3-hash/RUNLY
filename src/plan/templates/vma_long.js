// Template pilote — VMA longue sur 400m (classique).
// Structure : échauffement + gammes + corps (reps × 400m) + retour au calme.
// Reps : 6 à 10 selon niveau. Récup 90s trottinée.

export const vma400ClassiqueTemplate = {
  id: "vma-400-classique",
  type: "intervals",
  family: "vma_long",
  name: "VMA longue — 400m",
  intent:
    "Développer la VMA et l'économie de course à haute intensité. C'est dur mais court.",
  phasesFit: { base: 0.5, development: 1.0, specific: 0.6, taper: 0.2 },
  params: {
    reps: { min: 6, max: 10 },
  },
  blockSpecs: [
    { kind: "warmup", minutes: 15, zone: "Z2" },
    { kind: "drills" },
    {
      kind: "intervals_distance",
      distanceM: 400,
      paceContext: "vma_long",
      repsParam: "reps",
      recoverySec: 90,
    },
    { kind: "cooldown", minutes: 10 },
  ],
  tips: {
    before:
      "Prévois une collation légère 1h30 avant si tu fais cette séance après le travail.",
    during:
      "Reste régulier sur les 400m, ne pars pas trop vite sur les 2 premiers.",
    after:
      "Étirements doux + hydratation. Demain : footing très lent ou repos.",
  },
};
