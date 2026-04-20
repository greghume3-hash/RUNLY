// Famille "brick" — séances hybrides running + home trainer / tapis.
//
// Principe : pour certaines séances, mixer running et HT (home trainer)
// donne un meilleur résultat que l'un ou l'autre seul :
//   - Récupération active post-SL : footing léger pour activer les muscles
//     sans impact excessif, puis HT pour drainer sans re-traumatiser.
//   - Seuil indoor en cas de météo : HT pour warmup/cooldown (zéro impact),
//     tapis pour le bloc seuil (spécificité course maintenue).
//
// Ces templates supposent que l'utilisateur a le matériel adéquat
// (home_trainer + treadmill OU gym_access). Vérifié côté injection.

// Récup active combo : footing easy + home trainer Z1.
// Injecté automatiquement le lendemain d'une SL en phase développement
// si l'user a home_trainer + tapis/salle.
export const brickRecoveryTemplate = {
  id: "brick-recovery",
  type: "recovery",
  family: "brick",
  name: "Récup active combo — footing + home trainer",
  intent:
    "Récupération active optimale : footing très léger pour activer les muscles sans stress impactant, puis home trainer pour drainer sans effort articulaire supplémentaire. Plus efficace qu'une simple séance HT.",
  params: {
    runMin: { min: 20, max: 35 },
    htMin: { min: 15, max: 30 },
  },
  blockSpecs: [
    {
      kind: "run",
      paceContext: "recovery",
      durationParam: "runMin",
      label: "Footing récup",
    },
    {
      kind: "cross",
      activity: "home_trainer",
      durationParam: "htMin",
      intensity: "easy",
    },
  ],
  tips: {
    before:
      "Mobilisations articulaires avant le footing. Prévoir d'enchaîner sans pause longue.",
    during:
      "Footing : vraiment lent (Z1 stricte). HT : résistance très faible, cadence 80-85 rpm.",
    after: "Étirements doux + glucides dans l'heure.",
  },
};

// Seuil hybride indoor : warmup + cooldown sur HT, corps de séance sur tapis.
// Utile en cas de météo pourrie, reprise post-blessure, ou simplement pour
// protéger les articulations sur une séance dure.
// Pas injecté automatiquement — disponible comme alternative V2.
export const brickThresholdIndoorTemplate = {
  id: "brick-threshold-indoor",
  type: "tempo",
  family: "brick",
  name: "Seuil hybride indoor — HT + tapis",
  intent:
    "Séance seuil en intérieur : échauffement sur home trainer pour limiter les impacts, bloc seuil sur tapis à 1 % d'inclinaison, retour au calme sur HT pour drainer sans effort articulaire.",
  params: {
    reps: { min: 2, max: 3 },
    durationMin: { min: 10, max: 15 },
  },
  blockSpecs: [
    {
      kind: "cross",
      activity: "home_trainer",
      durationMin: 15,
      intensity: "easy",
      label: "Home trainer — Échauffement",
    },
    {
      kind: "tempo",
      paceContext: "threshold",
      repsParam: "reps",
      durationParam: "durationMin",
      recoveryMin: 3,
    },
    {
      kind: "cross",
      activity: "home_trainer",
      durationMin: 10,
      intensity: "easy",
      label: "Home trainer — Retour au calme",
    },
  ],
  tips: {
    before:
      "Mise en place : HT prêt à côté du tapis (ou à proximité). Serviette + bouteille.",
    during:
      "Tapis : 1 % d'inclinaison pour compenser l'absence de résistance à l'air. Allure seuil = celle prescrite dans la version course classique.",
    after:
      "Étirements obligatoires (HT + tapis chargent peu naturellement les articulations mais les muscles restent sollicités).",
  },
};
