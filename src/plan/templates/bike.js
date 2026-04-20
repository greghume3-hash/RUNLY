// Famille "bike" — séances vélo planifiées en complément de la course.
//
// Principe d'exécution (Niveau 2 validé avec l'utilisateur) :
// l'algo prescrit une CHARGE CIBLE (durée + zone d'effort).
// L'utilisateur choisit ensuite son support dans la modale plan :
//   - Home trainer / vélo d'appart → structure précise cadence/puissance
//   - Vélo extérieur (boucle libre) → durée + RPE
//   - Prolongation du vélotaff → détour sur le trajet habituel
//
// Zones vélo (sur FC max vélo, environ 10 bpm inférieure à FCmax running) :
//   Z1 < 65 %  : récup
//   Z2 65-75 % : endurance fondamentale
//   Z3 75-85 % : tempo / sweet spot
//   Z4 85-92 % : seuil
//   Z5 > 92 %  : VO2max
//
// Le `bikeZone` est exposé pour que la modale affiche la bonne zone.

// Vélo endurance — phase base principalement, développe l'aérobie
// sans impact. Idéal pour augmenter volume en toute sécurité.
export const bikeEnduranceTemplate = {
  id: "bike-endurance",
  type: "cross",
  family: "bike",
  name: "Vélo endurance",
  intent:
    "Développer ton aérobie sans impact. Utile en phase base ou en jour post-sortie longue (récup active).",
  params: {
    durationMin: { min: 45, max: 120 },
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
    before: "Hydratation + collation légère si > 1 h.",
    during:
      "Zone 2 (65-75 % FCmax vélo) — tu peux discuter. Cadence 80-90 rpm si tu peux la mesurer.",
    after: "Étirements quadriceps, ischios, mollets.",
  },
  // Méta spécifiques vélo (pour le rendu modale)
  bikeZone: "Z2",
  bikeZoneLabel: "Endurance fondamentale",
  bikeCadenceRpm: [80, 90],
};

// Vélo seuil — alternative à une séance seuil course quand on est fatigué,
// en récup de blessure, ou pour varier. Impact 0, stress cardio équivalent.
export const bikeThresholdTemplate = {
  id: "bike-threshold",
  type: "cross",
  family: "bike",
  name: "Vélo seuil",
  intent:
    "Travailler le seuil sans impact. Bonne alternative à un tempo course en période de fatigue ou de blessure mineure.",
  params: {
    reps: { min: 3, max: 5 },
  },
  blockSpecs: [
    {
      kind: "cross",
      activity: "bike",
      durationMin: 15,
      intensity: "easy",
      label: "Vélo — Échauffement",
    },
    {
      kind: "cross",
      activity: "bike",
      durationMin: 20,
      intensity: "hard",
      label: "Vélo — Blocs seuil (4×5 min)",
    },
    {
      kind: "cross",
      activity: "bike",
      durationMin: 10,
      intensity: "easy",
      label: "Vélo — Retour au calme",
    },
  ],
  tips: {
    before: "Séance exigeante — comme une séance seuil course. Repas 2-3 h avant.",
    during:
      "Zone 4 (85-92 % FCmax vélo) sur les blocs. Cadence 85-95 rpm en danseuse déconseillée.",
    after: "Hydratation + récup glucides dans les 30 min.",
  },
  bikeZone: "Z4",
  bikeZoneLabel: "Seuil",
  bikeCadenceRpm: [85, 95],
};

// Vélo récup — 30-45 min en Z1, idéal en lendemain de séance dure course
// pour activer la récupération sans impact.
export const bikeRecoveryTemplate = {
  id: "bike-recovery",
  type: "cross",
  family: "bike",
  name: "Vélo récupération",
  intent:
    "Récupération active post-séance course dure. Favorise le drainage sans solliciter les jambes impactées par la course.",
  params: {
    durationMin: { min: 30, max: 60 },
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
    during:
      "Zone 1 (< 65 % FCmax vélo) — TRÈS lent. Tu dois arriver frais·che à la fin.",
    after: null,
  },
  bikeZone: "Z1",
  bikeZoneLabel: "Récupération",
  bikeCadenceRpm: [75, 85],
};
