// Template pilote — Footing easy standard.
// 1 seul bloc, allure standard_easy (70 % VMA).
// Paramètre variable : durée (selon expérience et temps dispo).

export const easyStandardTemplate = {
  id: "easy-standard",
  type: "easy",
  family: "easy",
  name: "Footing easy standard",
  intent:
    "Construire ton volume de base. 80 % de tes kilomètres doivent se faire à cette allure.",
  phasesFit: { base: 1.0, development: 0.8, specific: 0.7, taper: 0.9 },
  // Fourchettes — résolues au moment de générer
  params: {
    durationMin: { min: 30, max: 60 },
  },
  blockSpecs: [
    {
      kind: "run",
      paceContext: "standard_easy",
      durationParam: "durationMin",
      label: "Footing",
    },
  ],
  tips: {
    before: null,
    during:
      "Tu dois pouvoir tenir une conversation sans être essoufflé·e. Si tu n'y arrives pas, ralentis.",
    after:
      "Bonne hydratation. Étirements légers ou pas d'étirements — au choix.",
  },
};
