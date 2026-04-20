// Famille "walk_run" : alternance marche / course pour très débutants.
// Activée quand paces.walkRunMode = true (VMA ≤ 9 km/h).

export const walkRun60_120Template = {
  id: "walk-run-60-120",
  type: "easy",
  family: "walk_run",
  name: "Marche-course débutant",
  intent:
    "Débuter en douceur. L'alternance marche-course évite les blessures et construit progressivement le foncier.",
  params: {
    cycles: { min: 6, max: 12 },
  },
  blockSpecs: [
    {
      kind: "cross",
      activity: "walk",
      durationParam: "warmup",
      durationMin: 5,
      intensity: "easy",
    },
    // On modélise simplement via intervals_time : 60s course / 120s marche
    {
      kind: "intervals_time",
      workSec: 60,
      recoverySec: 120,
      paceContext: "standard_easy",
      repsParam: "cycles",
      recoveryType: "walk",
    },
    {
      kind: "cross",
      activity: "walk",
      durationMin: 5,
      intensity: "easy",
    },
  ],
  tips: {
    before:
      "Chaussures amortissantes. Repère un parcours plat (parc, piste cyclable).",
    during:
      "Les parties courues restent TRÈS lentes. Si tu arrives à tenir 60s sans forcer, tu peux monter à 90s la prochaine fois.",
    after: "Pas de douleur articulaire = bon signe. Avec douleur, repos 48h.",
  },
};
