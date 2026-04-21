// Génération de workouts Garmin au format TCX (Training Center XML v2).
//
// Contrairement au GPX (qui ne décrit qu'un tracé), un workout TCX contient
// la STRUCTURE de la séance : warmup / blocs actifs / récups / cooldown,
// avec les allures cibles. Importé dans Garmin Connect → synchronisé sur
// la montre → la montre GUIDE l'utilisateur (bippe aux transitions, affiche
// l'allure cible, décompte le temps/distance en cours).
//
// Référence : Garmin Training Center Database Schema v2
//   https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd
//
// Ce fichier convertit notre objet Session (voir src/plan/session.js) en
// TCX importable depuis Garmin Connect > Entraînements > Importer.

// ---------- Helpers conversion unités ----------

// "mm:ss" → secondes. Retourne null si parse échoue.
function paceStringToSec(paceStr) {
  const m = String(paceStr).match(/^(\d+):(\d+)/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// sec/km → m/s (unité Garmin TCX pour speed)
function secPerKmToMps(secPerKm) {
  if (!secPerKm || secPerKm <= 0) return null;
  return 1000 / secPerKm;
}

// km/h → m/s
function kmhToMps(kmh) {
  return (kmh * 1000) / 3600;
}

function escape(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Mapping session.type → Sport TCX
function sportFor(session) {
  if (session.type === "cross" && session.family === "bike") return "Biking";
  if (session.family === "commute") return "Biking";
  return "Running"; // défaut
}

// ---------- Construction des Steps ----------

let stepIdCounter = 1;
function nextStepId() {
  return stepIdCounter++;
}

// Retourne un XML <Target> selon l'allure cible. Utilise CustomSpeedZone
// (tolérée par Garmin Connect) avec borne basse et haute en m/s.
function buildSpeedTarget(lowMps, highMps) {
  if (!lowMps || !highMps) return "<Target xsi:type=\"None_t\" />";
  return `<Target xsi:type="Speed_t">
    <SpeedZone xsi:type="CustomSpeedZone_t">
      <LowInMetersPerSecond>${lowMps.toFixed(3)}</LowInMetersPerSecond>
      <HighInMetersPerSecond>${highMps.toFixed(3)}</HighInMetersPerSecond>
    </SpeedZone>
  </Target>`;
}

function buildNoTarget() {
  return "<Target xsi:type=\"None_t\" />";
}

// Construit un <Step xsi:type="Step_t"> pour un bloc warmup/cooldown/active.
// kind : "Warmup" | "Active" | "Rest" | "Cooldown"
function buildStepXml({ name, kind, duration, target, notes }) {
  return `<Step xsi:type="Step_t">
    <StepId>${nextStepId()}</StepId>
    <Name>${escape(name).slice(0, 15)}</Name>
    ${duration}
    <Intensity>${kind}</Intensity>
    ${target}
    ${notes ? `<Notes>${escape(notes).slice(0, 512)}</Notes>` : ""}
  </Step>`;
}

// Durée en secondes
function durationSec(sec) {
  return `<Duration xsi:type="Time_t"><Seconds>${Math.round(sec)}</Seconds></Duration>`;
}
// Durée en mètres
function durationMeters(m) {
  return `<Duration xsi:type="Distance_t"><Meters>${Math.round(m)}</Meters></Duration>`;
}

// Extrait une fourchette de vitesse (m/s) depuis un bloc Runly.
// Cherche d'abord speedTarget (km/h), puis paceTarget (min/km).
function speedRangeFromBlock(block) {
  // work sub-object (intervals/tempo) prioritaire
  const w = block.work;
  const findSpeed = (src) => {
    if (!src) return null;
    // speedTarget peut être { value: 16.5 } OU { min: 10.7, max: 12.4 }
    const st = src.speedTarget;
    if (st) {
      if (typeof st.value === "number") return { center: kmhToMps(st.value) };
      if (typeof st.min === "number" && typeof st.max === "number") {
        return { low: kmhToMps(st.min), high: kmhToMps(st.max) };
      }
    }
    // paceTarget peut être { value: "5:12" } OU { min: "5:00", max: "5:30" }
    const pt = src.paceTarget;
    if (pt) {
      if (pt.value) {
        const s = paceStringToSec(pt.value);
        return s ? { center: secPerKmToMps(s) } : null;
      }
      if (pt.min && pt.max) {
        const sMin = paceStringToSec(pt.min); // allure rapide
        const sMax = paceStringToSec(pt.max); // allure lente
        if (sMin && sMax) {
          return { low: secPerKmToMps(sMax), high: secPerKmToMps(sMin) };
        }
      }
    }
    return null;
  };
  const fromWork = findSpeed(w);
  if (fromWork) return fromWork;
  return findSpeed(block);
}

// Construit les bornes m/s d'un bloc avec marge ±5 % si seule une centrale
function resolveTarget(block) {
  const range = speedRangeFromBlock(block);
  if (!range) return buildNoTarget();
  if (range.low != null && range.high != null) {
    return buildSpeedTarget(range.low, range.high);
  }
  if (range.center != null) {
    const low = range.center * 0.95;
    const high = range.center * 1.05;
    return buildSpeedTarget(low, high);
  }
  return buildNoTarget();
}

// ---------- Mapping Block Runly → Steps TCX ----------

function blockToSteps(block) {
  const xmls = [];

  switch (block.type) {
    case "warmup":
      xmls.push(
        buildStepXml({
          name: "Echauff.",
          kind: "Warmup",
          duration: durationSec((block.durationMin ?? 15) * 60),
          target: resolveTarget(block),
          notes: block.description,
        })
      );
      break;

    case "cooldown":
      xmls.push(
        buildStepXml({
          name: "Retour calme",
          kind: "Cooldown",
          duration: durationSec((block.durationMin ?? 10) * 60),
          target: resolveTarget(block),
          notes: block.description,
        })
      );
      break;

    case "drills":
      // Gammes : bloc Active sans target (montre guide par temps)
      xmls.push(
        buildStepXml({
          name: "Gammes",
          kind: "Active",
          duration: durationSec((block.durationMin ?? 5) * 60),
          target: buildNoTarget(),
          notes: block.description,
        })
      );
      break;

    case "easy":
    case "recovery":
      xmls.push(
        buildStepXml({
          name: (block.label || "Footing").slice(0, 15),
          kind: "Active",
          duration: durationSec((block.durationMin ?? 30) * 60),
          target: resolveTarget(block),
          notes: block.description,
        })
      );
      break;

    case "cross":
      // Cross (vélo, etc.) : bloc Active simple
      xmls.push(
        buildStepXml({
          name: (block.label || "Cross").slice(0, 15),
          kind: "Active",
          duration: durationSec((block.durationMin ?? 30) * 60),
          target: buildNoTarget(),
          notes: block.description,
        })
      );
      break;

    case "tempo":
      xmls.push(...tempoToSteps(block));
      break;

    case "intervals":
      xmls.push(...intervalsToSteps(block));
      break;

    default:
      // Fallback : un bloc Active avec la durée si connue
      if (block.durationMin) {
        xmls.push(
          buildStepXml({
            name: (block.label || "Bloc").slice(0, 15),
            kind: "Active",
            duration: durationSec(block.durationMin * 60),
            target: buildNoTarget(),
            notes: block.description,
          })
        );
      }
  }
  return xmls;
}

// Tempo : 1 bloc continu OU N répétitions avec récup
function tempoToSteps(block) {
  const w = block.work;
  const reps = block.repetitions ?? 1;

  if (!w && block.durationMin) {
    // fartlek ou bloc libre
    return [
      buildStepXml({
        name: (block.label || "Bloc").slice(0, 15),
        kind: "Active",
        duration: durationSec(block.durationMin * 60),
        target: resolveTarget(block),
        notes: block.description,
      }),
    ];
  }

  if (!w) return [];

  const workStep = buildStepXml({
    name: "Tempo",
    kind: "Active",
    duration: w.durationMin
      ? durationSec(w.durationMin * 60)
      : w.distanceKm
      ? durationMeters(w.distanceKm * 1000)
      : durationSec(600),
    target: resolveTarget(block),
    notes: block.description,
  });

  if (reps <= 1 || !block.recovery) return [workStep];

  // N > 1 : on construit un Repeat
  const recSec =
    block.recovery.durationMin != null
      ? block.recovery.durationMin * 60
      : block.recovery.durationSec ?? 180;
  const recoveryStep = buildStepXml({
    name: "Récup",
    kind: "Rest",
    duration: durationSec(recSec),
    target: buildNoTarget(),
    notes: "Trot récup",
  });
  return [wrapRepeat(reps, [workStep, recoveryStep])];
}

// Intervals : distance ou temps, presque toujours N > 1 avec récup
function intervalsToSteps(block) {
  // Séquences (pyramide) : on développe chaque step individuellement,
  // puis on wrap en Repeat si block.repetitions > 1.
  if (block.sequence?.length) {
    const innerSteps = [];
    for (const s of block.sequence) {
      const lowMps = s.speedTarget?.value ? kmhToMps(s.speedTarget.value) * 0.95 : null;
      const highMps = s.speedTarget?.value ? kmhToMps(s.speedTarget.value) * 1.05 : null;
      const target = lowMps && highMps ? buildSpeedTarget(lowMps, highMps) : buildNoTarget();
      const dur = s.workDistanceM
        ? durationMeters(s.workDistanceM)
        : durationSec(s.workSec ?? 30);
      innerSteps.push(
        buildStepXml({
          name: s.workDistanceM ? `${s.workDistanceM}m` : `${s.workSec}s`,
          kind: "Active",
          duration: dur,
          target,
        })
      );
      if (s.recoverySec) {
        innerSteps.push(
          buildStepXml({
            name: "Récup",
            kind: "Rest",
            duration: durationSec(s.recoverySec),
            target: buildNoTarget(),
          })
        );
      }
    }
    if ((block.repetitions ?? 1) > 1) {
      return [wrapRepeat(block.repetitions, innerSteps)];
    }
    return innerSteps;
  }

  const w = block.work;
  if (!w || !block.repetitions) return [];

  const workStep = buildStepXml({
    name: w.distance
      ? `${w.distance}m`
      : w.durationSec
      ? `${w.durationSec}s`
      : "Intervalle",
    kind: "Active",
    duration: w.distance
      ? durationMeters(w.distance)
      : w.durationSec
      ? durationSec(w.durationSec)
      : durationSec(60),
    target: resolveTarget(block),
    notes: block.description,
  });

  const recSec = block.recovery?.durationSec ?? 90;
  const recoveryStep = buildStepXml({
    name: "Récup",
    kind: "Rest",
    duration: durationSec(recSec),
    target: buildNoTarget(),
    notes: "Trot récup",
  });
  return [wrapRepeat(block.repetitions, [workStep, recoveryStep])];
}

function wrapRepeat(reps, childrenXmls) {
  return `<Step xsi:type="Repeat_t">
    <StepId>${nextStepId()}</StepId>
    <Repetitions>${reps}</Repetitions>
    ${childrenXmls.join("\n")}
  </Step>`;
}

// ---------- API publique ----------

export function sessionToTcxWorkout(session, { name } = {}) {
  stepIdCounter = 1;
  const sport = sportFor(session);
  // Garmin Connect tolère un workout name ≤ 15 car (contrainte historique).
  // On tronque avec un suffixe S{weekNumber}.
  const fullName = name ?? buildWorkoutName(session);

  const steps = (session.blocks || []).flatMap(blockToSteps).join("\n");

  // Garmin Connect exige au moins 1 step
  const safeSteps =
    steps ||
    buildStepXml({
      name: "Free",
      kind: "Active",
      duration: durationSec((session.totalDurationMin || 30) * 60),
      target: buildNoTarget(),
    });

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Workouts>
    <Workout Sport="${sport}">
      <Name>${escape(fullName).slice(0, 15)}</Name>
      ${safeSteps}
    </Workout>
  </Workouts>
</TrainingCenterDatabase>
`;
}

function buildWorkoutName(session) {
  // Nom compact ≤ 15 car : "VMA400 S3" par ex.
  const abbr = {
    "vma-400-classique": "VMA400",
    "vma-1000-classique": "VMA1000",
    "vma-500-1000-alternes": "VMA500/1k",
    "vma-pyramide": "Pyramide",
    "vma-pyramide-distance": "Pyr.dist",
    "vma-30-30-classique": "30-30",
    "hills-courts": "Cotes",
    "threshold-2blocks": "Seuil2",
    "threshold-continu": "Tempo",
    "threshold-4blocks": "Seuil4x8",
    "specific-marathon-block": "Bloc AM",
    "specific-10k-block": "Bloc 10k",
    "long-run-classic": "SL",
    "long-progressive": "SL prog",
    "long-with-marathon-block": "SL+AM",
    "long-trail": "SL trail",
    "easy-standard": "Footing",
    "easy-progressive": "Foot.prog",
    "easy-strides": "Foot.LD",
    "easy-fartlek-nature": "Fartlek",
    "recovery-run": "Decrass",
    "test-vma-3000": "Test 3000m",
    "simulation-race": "Simul",
    "taper-activation": "Activ.",
    "bike-endurance": "Velo EF",
    "bike-threshold": "Velo seuil",
    "bike-recovery": "Velo recup",
    "brick-recovery": "Brick recup",
    "brick-threshold-indoor": "Brick seuil",
    "commute-daily": "Velotaff",
  };
  const base = abbr[session.templateId] ?? "Session";
  const wk = session.week != null ? ` S${session.week}` : "";
  return (base + wk).slice(0, 15);
}

export function downloadTcxWorkout(tcxString, filename = "workout.tcx") {
  const blob = new Blob([tcxString], {
    type: "application/vnd.garmin.tcx+xml",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Workflow complet : télécharge le TCX + ouvre Garmin Connect Workouts
export function sendToGarminWatch(tcxString, filename = "workout.tcx") {
  downloadTcxWorkout(tcxString, filename);
  setTimeout(() => {
    window.open(
      "https://connect.garmin.com/modern/workout/import",
      "_blank"
    );
  }, 300);
}
