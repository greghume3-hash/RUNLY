// Famille "vma_long" — deux templates supplémentaires pour la rotation.

// 1000m classique : 3-6 × 1000m à 100-105 % VMA, récup 2 min.
// Séance de référence pour développer l'endurance à VMA.
// Plus "marathonienne" que le 400m.
export const vma1000ClassiqueTemplate = {
  id: "vma-1000-classique",
  type: "intervals",
  family: "vma_long",
  name: "VMA longue — 1000m",
  intent:
    "Tenir la VMA sur des efforts plus longs. Base de la performance sur 10k et semi.",
  phasesFit: { base: 0.2, development: 1.0, specific: 0.9, taper: 0.3 },
  params: {
    reps: { min: 3, max: 6 },
  },
  blockSpecs: [
    { kind: "warmup", minutes: 15, zone: "Z2" },
    { kind: "drills" },
    {
      kind: "intervals_distance",
      distanceM: 1000,
      paceContext: "vma_long",
      repsParam: "reps",
      recoverySec: 120,
    },
    { kind: "cooldown", minutes: 10 },
  ],
  tips: {
    before: "Séance exigeante — évite si tu as dormi moins de 6h.",
    during: "Le 3e 1000m est le plus dur psychologiquement. Serre les dents.",
    after: "Minimum 48h avant la prochaine séance dure.",
  },
};

// Pyramide en distance : 200/400/600/400/200, récup 1-2 min trot.
// Travail de lucidité sur des durées d'effort différentes à VMA.
export const vmaPyramideDistanceTemplate = {
  id: "vma-pyramide-distance",
  type: "intervals",
  family: "vma_long",
  name: "VMA longue — pyramide 200/400/600",
  intent:
    "Développer la VMA en montant-descendant la durée d'effort. Plus dur psychologiquement qu'une série classique.",
  phasesFit: { base: 0.3, development: 1.0, specific: 0.5, taper: 0.1 },
  params: {
    series: { min: 1, max: 2 },
  },
  blockSpecs: [
    { kind: "warmup", minutes: 15, zone: "Z2" },
    { kind: "drills" },
    {
      kind: "intervals_sequence",
      paceContext: "vma_long",
      seriesParam: "series",
      betweenSeriesRecoveryMin: 4,
      steps: [
        { workDistanceM: 200, recoverySec: 60 },
        { workDistanceM: 400, recoverySec: 90 },
        { workDistanceM: 600, recoverySec: 120 },
        { workDistanceM: 400, recoverySec: 90 },
        { workDistanceM: 200, recoverySec: 60 },
      ],
    },
    { kind: "cooldown", minutes: 10 },
  ],
  tips: {
    before: "Séance sur piste idéalement, sinon parcours plat repéré.",
    during: "Les 600m sont le pic d'effort. Garde quelque chose pour la descente.",
    after: "Étirements ischios + mollets. Récup 48h.",
  },
};

// 500m / 1000m alternés : bon mélange endurance + allure
export const vma500_1000Template = {
  id: "vma-500-1000-alternes",
  type: "intervals",
  family: "vma_long",
  name: "VMA longue — 500m / 1000m alternés",
  intent:
    "Alterner allures rapides et soutenues pour mieux gérer les changements de rythme.",
  phasesFit: { base: 0.2, development: 0.9, specific: 1.0, taper: 0.3 },
  params: {
    series: { min: 2, max: 4 },
  },
  blockSpecs: [
    { kind: "warmup", minutes: 15, zone: "Z2" },
    { kind: "drills" },
    {
      kind: "intervals_distance",
      distanceM: 500,
      paceContext: "vma_short",
      reps: 3,
      recoverySec: 90,
    },
    {
      kind: "intervals_distance",
      distanceM: 1000,
      paceContext: "vma_long",
      reps: 3,
      recoverySec: 120,
    },
    { kind: "cooldown", minutes: 10 },
  ],
  tips: {
    before: null,
    during: "Reste patient·e sur les 500m, ne grille pas tes cartouches.",
    after: "Récup active le lendemain.",
  },
};
