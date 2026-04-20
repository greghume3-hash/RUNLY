// Famille "easy" — templates complémentaires pour la rotation.

// Footing progressif : accélération linéaire sur la durée.
export const easyProgressiveTemplate = {
  id: "easy-progressive",
  type: "easy",
  family: "easy",
  name: "Footing progressif",
  intent:
    "Apprendre à finir plus vite qu'on a commencé. Habitue le corps à l'accélération en fin d'effort.",
  params: {
    durationMin: { min: 35, max: 60 },
  },
  blockSpecs: [
    {
      kind: "progressive",
      durationParam: "durationMin",
    },
  ],
  tips: {
    before: null,
    during: "Accélère en douceur. Le dernier tiers doit être soutenu mais pas dur.",
    after: null,
  },
};

// Footing + lignes droites : ajoute 6 accélérations courtes en fin.
// Bon pour la souplesse et la foulée, sans stress cardio.
export const easyStridesTemplate = {
  id: "easy-strides",
  type: "easy",
  family: "easy",
  name: "Footing avec lignes droites",
  intent:
    "Footing facile + 6 accélérations pour travailler la foulée sans fatigue importante.",
  params: {
    durationMin: { min: 30, max: 50 },
  },
  blockSpecs: [
    {
      kind: "run",
      paceContext: "standard_easy",
      durationParam: "durationMin",
      label: "Footing",
    },
    { kind: "strides" },
  ],
  tips: {
    before: null,
    during: "Sur les lignes droites, accélère progressivement jusqu'à 90 % — pas un sprint.",
    after: null,
  },
};

// Footing de récupération (Z1 strict, très court).
export const recoveryRunTemplate = {
  id: "recovery-run",
  type: "recovery",
  family: "recovery",
  name: "Décrassage",
  intent:
    "Favoriser la récupération active après une séance dure. Très lent, très court.",
  params: {
    durationMin: { min: 20, max: 35 },
  },
  blockSpecs: [
    {
      kind: "run",
      paceContext: "recovery",
      durationParam: "durationMin",
      label: "Décrassage",
    },
  ],
  tips: {
    before: null,
    during: "Vraiment lent. Si tu doutes, ralentis encore.",
    after: null,
  },
};

// Fartlek nature : séance de fraîcheur (1/8)
// type "easy" bien que contenant des variations : c'est du jeu, pas
// une séance structurée dure → classée modérée pour l'affichage.
export const fartlekNatureTemplate = {
  id: "easy-fartlek-nature",
  type: "easy",
  family: "easy",
  name: "Fartlek nature",
  intent:
    "Casser la routine avec une séance libre. Joue avec le terrain, amuse-toi.",
  params: {
    durationMin: { min: 30, max: 50 },
  },
  blockSpecs: [
    { kind: "warmup", minutes: 10, zone: "Z2" },
    {
      kind: "fartlek",
      durationParam: "durationMin",
    },
    { kind: "cooldown", minutes: 5 },
  ],
  tips: {
    before: "Aucune contrainte d'allure stricte aujourd'hui. Fais-toi plaisir.",
    during: "Accélère quand tu veux, sur la durée que tu veux. Écoute tes sensations.",
    after: null,
  },
};
