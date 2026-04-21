// Template pilote — Sortie longue classique.
// 1 bloc unique en endurance fondamentale (long_run_base, 68 % VMA).
// Durée variable selon objectif et volume.

export const longRunClassicTemplate = {
  id: "long-run-classic",
  type: "long",
  family: "long",
  name: "Sortie longue — classique",
  intent:
    "Développer ton endurance et ta capacité à courir longtemps. Pilier de tout plan sérieux.",
  phasesFit: { base: 1.0, development: 0.9, specific: 0.5, taper: 0.8 },
  params: {
    durationMin: { min: 60, max: 120 },
  },
  blockSpecs: [
    {
      kind: "run",
      paceContext: "long_run_base",
      durationParam: "durationMin",
      label: "Sortie longue",
    },
  ],
  tips: {
    before:
      "Petit-déjeuner 2-3 h avant, ou collation 1 h avant. Prévois une boisson si > 1 h.",
    during:
      "Vraiment lent. L'erreur classique c'est de courir trop vite. Si tu hésites, ralentis.",
    after:
      "Re-alimentation dans les 30 min (glucides + protéines). Étirements doux si tu aimes.",
  },
};
