// Famille "cross" : séances de cross-training.
// Utilisées pour compléter le volume sans surcharger les jambes,
// ou en remplacement quand blessure / vélotaff.

export const crossBikeEasyTemplate = {
  id: "cross-bike-easy",
  type: "cross",
  family: "cross",
  name: "Vélo tranquille",
  intent:
    "Maintenir l'aérobie sans impact. Utile en récupération active ou en remplacement d'un footing.",
  params: {
    durationMin: { min: 45, max: 90 },
  },
  blockSpecs: [
    {
      kind: "cross",
      activity: "bike",
      durationParam: "durationMin",
      intensity: "easy",
    },
  ],
  tips: {
    before: null,
    during: "Intensité modérée. Tu dois pouvoir discuter sans effort.",
    after: null,
  },
};

export const crossSwimTemplate = {
  id: "cross-swim",
  type: "cross",
  family: "cross",
  name: "Natation",
  intent:
    "Récup active sans impact. Idéal après une séance dure ou en période de fatigue.",
  params: {
    durationMin: { min: 30, max: 60 },
  },
  blockSpecs: [
    {
      kind: "cross",
      activity: "swim",
      durationParam: "durationMin",
      intensity: "easy",
    },
  ],
  tips: {
    before: null,
    during: "Enchaîne les longueurs tranquillement. Pas de chrono.",
    after: null,
  },
};

export const crossStrengthTemplate = {
  id: "cross-strength",
  type: "cross",
  family: "cross",
  name: "Renforcement",
  intent:
    "Renforcer les chaînes musculaires clés (fessiers, gainage, mollets) pour prévenir les blessures et gagner en économie de course.",
  params: {
    durationMin: { min: 25, max: 45 },
  },
  blockSpecs: [
    {
      kind: "cross",
      activity: "strength",
      durationParam: "durationMin",
      intensity: "easy",
    },
  ],
  tips: {
    before: "Échauffement général avant (5-10 min de vélo ou footing très lent).",
    during:
      "Concentre-toi sur la qualité d'exécution. Fessiers, gainage, ischios = priorités pour coureur.",
    after: "Étirements légers.",
  },
};

export const crossHomeTrainerTemplate = {
  id: "cross-home-trainer",
  type: "cross",
  family: "cross",
  name: "Home trainer",
  intent:
    "Alternative indoor quand météo ou temps limité. Volume aérobie sans impact.",
  params: {
    durationMin: { min: 30, max: 75 },
  },
  blockSpecs: [
    {
      kind: "cross",
      activity: "home_trainer",
      durationParam: "durationMin",
      intensity: "easy",
    },
  ],
  tips: {
    before: "Ventilateur recommandé.",
    during: "Alterne positions (en selle / en danseuse si tu veux).",
    after: null,
  },
};
