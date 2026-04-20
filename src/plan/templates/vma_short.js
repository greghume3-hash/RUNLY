// Famille "vma_short" : intervalles très courts à 95-100 % VMA.
// 3 templates : 30-30 classique, 30-30 pyramide, côtes courtes.

// 30-30 classique : 30s rapide / 30s trottinée.
// Paradigme Billat, très polyvalent, bon pour développer la VMA sans
// abîmer les jambes avec du volume à haute vitesse.
export const vma3030ClassiqueTemplate = {
  id: "vma-30-30-classique",
  type: "intervals",
  family: "vma_short",
  name: "VMA courte — 30-30",
  intent:
    "Développer la VMA à dose concentrée. Les efforts courts protègent des blessures tout en stimulant l'économie de course.",
  params: {
    reps: { min: 10, max: 20 },
  },
  blockSpecs: [
    { kind: "warmup", minutes: 15, zone: "Z2" },
    { kind: "drills" },
    {
      kind: "intervals_time",
      workSec: 30,
      recoverySec: 30,
      paceContext: "vma_short",
      repsParam: "reps",
      recoveryType: "jog",
    },
    { kind: "cooldown", minutes: 10 },
  ],
  tips: {
    before: "Échauffe-toi sérieusement, les premiers 30s vont vite paraître durs.",
    during: "Reste régulier·e, ne pars pas en sprint sur les 2-3 premiers.",
    after: "Étirements doux + hydratation.",
  },
};

// Pyramide : 30s/45s/60s/45s/30s × 2-3 séries, récup = effort.
// La séance monte en durée puis redescend — utile pour travailler la VMA
// sur plusieurs durées d'effort dans la même séance.
export const vmaPyramideTemplate = {
  id: "vma-pyramide",
  type: "intervals",
  family: "vma_short",
  name: "VMA courte — pyramide",
  intent:
    "Travailler la VMA sur différentes durées d'effort. La séquence montante-descendante développe la lucidité tactique et l'endurance à vitesse élevée.",
  params: {
    series: { min: 2, max: 3 },
  },
  blockSpecs: [
    { kind: "warmup", minutes: 15, zone: "Z2" },
    { kind: "drills" },
    {
      kind: "intervals_sequence",
      paceContext: "vma_short",
      seriesParam: "series",
      betweenSeriesRecoveryMin: 3,
      // Pyramide montante-descendante ; récup = durée de l'effort
      steps: [
        { workSec: 30, recoverySec: 30 },
        { workSec: 45, recoverySec: 45 },
        { workSec: 60, recoverySec: 60 },
        { workSec: 45, recoverySec: 45 },
        { workSec: 30, recoverySec: 30 },
      ],
    },
    { kind: "cooldown", minutes: 10 },
  ],
  tips: {
    before: null,
    during:
      "Sur les 60s (sommet), relâche la foulée pour tenir l'allure. Sur les 30s de la descente, reste lucide — c'est là que la technique lâche.",
    after: "Récup importante : pas d'intense le lendemain.",
  },
};

// Côtes courtes : 8-12 × 30s en montée.
// Excellent pour débutants et traileurs : force les ischios,
// améliore la foulée, moins de risque de blessure qu'une VMA sur piste.
export const hillsCourtsTemplate = {
  id: "hills-courts",
  type: "hills",
  family: "hills",
  name: "Côtes courtes",
  intent:
    "Développer la puissance et la force spécifique à la course en côte. Pour les débutants : remplace une VMA classique, moins traumatisant.",
  params: {
    reps: { min: 6, max: 12 },
  },
  blockSpecs: [
    { kind: "warmup", minutes: 15, zone: "Z2" },
    {
      kind: "hills",
      workSec: 30,
      recoverySec: 90,
      repsParam: "reps",
      paceContext: "vma_short",
    },
    { kind: "cooldown", minutes: 10 },
  ],
  tips: {
    before: "Repère une côte d'environ 5-8 % de pente, sur 80-150 m.",
    during: "Bras actifs, buste droit, relance la foulée en haut.",
    after: "Étirements quadriceps + mollets recommandés.",
  },
};
