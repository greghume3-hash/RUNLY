// Séances "événements" — points de bascule du plan.
// Injectées à des positions fixes :
//   - Test VMA 3000m → semaine 1 de la phase développement (recalibre les allures)
//   - Simulation race → milieu de la phase spécifique
//   - Activation taper → première semaine du taper
//
// Ces templates ont phasesFit=0 partout sauf dans leur "phase cible"
// pour éviter qu'ils soient sélectionnés à tort par selectTemplate.

// --- Test VMA sur 3000m : référence pour recaler les allures -------
// Reste la meilleure méthode terrain pour mesurer ou mettre à jour
// la VMA (on divise la distance/temps par 1.00 pour obtenir la vitesse).
export const testVma3000Template = {
  id: "test-vma-3000",
  type: "intervals",
  family: "vma_long",
  name: "Test VMA — 3000m",
  intent:
    "Test de référence pour mesurer (ou recaler) ta VMA. À faire sur une piste ou une route plate repérée. Le temps obtenu permet de vérifier et ajuster tes allures d'entraînement.",
  phasesFit: { base: 0.0, development: 0.0, specific: 0.0, taper: 0.0 },
  params: {},
  blockSpecs: [
    { kind: "warmup", minutes: 20, zone: "Z2" },
    { kind: "drills" },
    {
      kind: "intervals_distance",
      distanceM: 3000,
      paceContext: "vma_short",
      reps: 1,
      recoverySec: 0,
    },
    { kind: "cooldown", minutes: 15 },
  ],
  tips: {
    before:
      "Test à faire frais·che — évite les 2 jours de séance dure avant. Piste 400m idéale, sinon route plate sans feux.",
    during:
      "Pars prudemment sur le 1er 1000m, monte en intensité sur le 2e, donne tout sur le 3e. Note ton temps.",
    after:
      "Reporte ton chrono dans ton profil — on recalculera automatiquement tes allures d'entraînement.",
  },
};

// --- Simulation à allure course : temps réel en conditions race ---
// La séance-clé en milieu de phase spécifique : bloc continu à allure
// course sur 40-60 % de la distance cible. Sert à valider l'allure tenable.
export const simulationRaceTemplate = {
  id: "simulation-race",
  type: "tempo",
  family: "specific_pace",
  name: "Simulation course",
  intent:
    "Séance phare de la phase spécifique : valider ton allure course objective sur une portion significative (~40-60 % de la distance). Point de repère mental et physiologique avant le jour J.",
  phasesFit: { base: 0.0, development: 0.0, specific: 0.0, taper: 0.0 },
  params: {
    simDurationMin: { min: 20, max: 45 },
  },
  blockSpecs: [
    { kind: "warmup", minutes: 15, zone: "Z2" },
    {
      kind: "specific_pace",
      paceContext: "10k_pace",
      durationParam: "simDurationMin",
    },
    { kind: "cooldown", minutes: 10 },
  ],
  tips: {
    before: "Collation glucides 2h avant. Même tenue que le jour de course.",
    during:
      "Respecte l'allure cible à ±2 sec/km. Si tu craques avant la fin : signal que l'allure est trop ambitieuse pour le jour J.",
    after:
      "Analyse l'effort : tenable ? Fatigue résiduelle ? Ajuste si besoin ton objectif course.",
  },
};

// --- Activation taper : rappel VMA courte en semaine 1 du taper ---
// En taper on ne veut PAS de nouvelle charge, juste maintenir la fraîcheur
// nerveuse. Cette séance courte (5-6×200m rapide) active sans fatiguer.
export const taperActivationTemplate = {
  id: "taper-activation",
  type: "intervals",
  family: "vma_short",
  name: "Activation — rappel VMA court",
  intent:
    "Maintenir la fraîcheur nerveuse en phase d'affûtage. Volume ultra-léger, juste assez pour rappeler aux jambes la vitesse de course.",
  phasesFit: { base: 0.0, development: 0.0, specific: 0.0, taper: 0.0 },
  params: {},
  blockSpecs: [
    { kind: "warmup", minutes: 15, zone: "Z2" },
    {
      kind: "intervals_distance",
      distanceM: 200,
      paceContext: "vma_short",
      reps: 6,
      recoverySec: 120,
    },
    { kind: "cooldown", minutes: 10 },
  ],
  tips: {
    before: null,
    during:
      "Les 200m doivent rester rapides MAIS fluides. Pas de sortie de zone — si ça se bloque, arrête.",
    after: "Étirements doux. Jour J dans quelques jours, tu dois te sentir frais·che.",
  },
};
