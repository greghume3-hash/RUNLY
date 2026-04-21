// Service frontend : appelle la Netlify Function /api/route pour
// générer un parcours en boucle depuis la position de l'utilisateur,
// adapté au type de séance.

// ---------------------------------------------------------------------
// Choix du profil ORS selon la séance
// ---------------------------------------------------------------------
function pickOrsProfile(session, userProfile) {
  if (session.type === "cross") {
    // Nouvelle famille "bike" (bike-endurance/threshold/recovery) — toujours vélo
    if (session.family === "bike") return "cycling-regular";
    // Ancienne famille "cross" générique : vélo seulement si le 1er bloc est étiqueté "Vélo"
    if (session.family === "cross" && session.blocks?.[0]?.label === "Vélo") {
      return "cycling-regular";
    }
    return null;
  }
  const obj = userProfile.objectiveCategory;
  const terrain = userProfile.preferredTerrain;
  if (obj === "trail" || terrain === "path") return "foot-hiking";
  return "foot-walking";
}

// ---------------------------------------------------------------------
// Préférence ORS + cibles de dénivelé par type de séance
// ---------------------------------------------------------------------
// "shortest" favorise les parcours plats (moins de détours = moins de D+).
// elevPerKmMin/Max (en m/km) = fourchette acceptable pour le parcours.
// Principe : seules les séances SPÉCIFIQUES (côtes, SL trail clé) cherchent
// du dénivelé ; la majorité des séances se font sur du plat à modéré.
function getRouteConstraints(session, userProfile) {
  const type = session.type;
  const family = session.family;
  const obj = userProfile.objectiveCategory;
  const targetEleM = userProfile.targetElevationM ?? 0;
  const targetDistKm = userProfile.objectiveDistanceKm ?? 0;

  // Côtes = on VEUT du dénivelé fort
  if (family === "hills") {
    return { preference: "recommended", elevPerKmMin: 25, elevPerKmMax: 60 };
  }

  // Sortie longue trail : 60-90 % du D+/km de la course (jamais plus).
  // Le but d'une SL n'est PAS de reproduire tout le dénivelé de la course,
  // mais d'habituer les jambes progressivement.
  if (type === "long" && obj === "trail" && targetDistKm > 0 && targetEleM > 0) {
    const raceElevPerKm = targetEleM / targetDistKm;
    return {
      preference: "recommended",
      elevPerKmMin: Math.round(Math.max(10, raceElevPerKm * 0.6)),
      elevPerKmMax: Math.round(raceElevPerKm * 0.9),
    };
  }

  // Footings trail (pas la SL) : plat à modéré
  if (obj === "trail" && (type === "easy" || type === "recovery")) {
    return { preference: "recommended", elevPerKmMin: 5, elevPerKmMax: 20 };
  }

  // Footings easy / récup / VMA / seuil route : on veut du plat
  if (
    type === "easy" ||
    type === "recovery" ||
    type === "intervals" ||
    type === "tempo"
  ) {
    return { preference: "shortest", elevPerKmMin: 0, elevPerKmMax: 12 };
  }

  // Long run route : dénivelé modéré (pas de recherche de plat strict)
  if (type === "long") {
    return { preference: "recommended", elevPerKmMin: 0, elevPerKmMax: 18 };
  }

  // Défaut
  return { preference: "recommended", elevPerKmMin: 0, elevPerKmMax: 15 };
}

// ---------------------------------------------------------------------
// Distance cible d'un parcours pour une séance donnée
// ---------------------------------------------------------------------
// On itère sur les blocs pour calculer précisément la distance parcourue,
// chaque bloc avec SA vitesse cible propre. La vitesse dépend aussi du
// contexte (trail = plus lent à cause du terrain et du D+).
export function estimateRouteDistance(session, userProfile = {}) {
  if (session.totalDistanceKm) return Math.round(session.totalDistanceKm * 10) / 10;
  const isTrail = userProfile.objectiveCategory === "trail";

  // Fallback sur le type si aucun bloc lisible
  if (!Array.isArray(session.blocks) || session.blocks.length === 0) {
    const avgKmh = avgSpeedForType(session.type, isTrail);
    return Math.round((session.totalDurationMin || 45) * avgKmh / 60 * 10) / 10;
  }

  let totalKm = 0;
  for (const b of session.blocks) {
    totalKm += distanceForBlock(b, isTrail);
  }
  return Math.round(totalKm * 10) / 10;
}

// Vitesse moyenne réelle (km/h) pour un type de séance, en tenant compte
// du terrain. Les valeurs "trail" sont calibrées sur l'observation qu'un
// traileur fait 7-8 km/h sur sortie longue (vs 9-10 sur route) à cause
// du D+, du terrain technique et des pauses éventuelles.
function avgSpeedForType(type, isTrail = false) {
  if (isTrail) {
    return {
      recovery: 7,
      easy: 8,
      long: 7.5,
      tempo: 10,
      intervals: 9,
      hills: 7,
      cross: 20,
    }[type] ?? 8;
  }
  return {
    recovery: 9,
    easy: 10,
    long: 9.5, // plus bas que l'allure EF pure : inclut les "pauses" inévitables
    tempo: 12,
    intervals: 10.5,
    hills: 9.5,
    cross: 20,
  }[type] ?? 10;
}

// Calcule la distance d'un bloc selon sa nature.
// Le flag isTrail atténue les vitesses de "run" standard (~-15 %).
function distanceForBlock(b, isTrail = false) {
  const trailFactor = isTrail ? 0.82 : 1.0;
  // Warmup / cooldown / easy / recovery : durée × vitesse du bloc
  if (b.type === "warmup" || b.type === "cooldown" || b.type === "easy" || b.type === "recovery") {
    const kmh = b.speedTarget?.value ?? b.speedTarget?.min ?? 10;
    const speed = typeof kmh === "string" ? averageFromString(kmh) : Number(kmh);
    return ((b.durationMin || 0) * speed * trailFactor) / 60;
  }

  // Drills / lignes droites : ~600m pour 6 lignes de 100m + marche
  if (b.type === "drills") {
    return b.label === "Lignes droites" ? 0.6 : 0.2;
  }

  // Intervalles par distance (ex: 6×400m + récup trot)
  if (b.type === "intervals" && b.work?.distance) {
    const reps = b.repetitions || 1;
    const workKm = (b.work.distance * reps) / 1000;
    // Récup en trot : durée_récup × ~9 km/h (trot lent)
    const recSec = b.recovery?.durationSec ?? 0;
    const recKm = ((recSec / 60) * 9 / 60) * (reps - 1);
    return workKm + recKm;
  }

  // Intervalles par temps (ex: 30-30, séquences)
  if (b.type === "intervals" && (b.work?.durationSec || b.sequence)) {
    const reps = b.repetitions || 1;
    // Séquences : somme de tous les steps
    if (b.sequence) {
      let km = 0;
      for (let i = 0; i < reps; i++) {
        for (const step of b.sequence) {
          const stepKmh = step.speedTarget?.value ?? 16;
          const workKm = step.workDistanceM
            ? step.workDistanceM / 1000
            : ((step.workSec || 0) * stepKmh / 3600);
          const recKm = ((step.recoverySec || 0) * 9 / 3600);
          km += workKm + recKm;
        }
      }
      return km;
    }
    // Intervalles simples par temps
    const workKmh = b.work.speedTarget?.value ?? 16;
    const workKm = (reps * (b.work.durationSec || 0) * workKmh) / 3600;
    const recKm = ((reps - 1) * (b.recovery?.durationSec || 0) * 9) / 3600;
    return workKm + recKm;
  }

  // Tempo / seuil par durée
  if (b.type === "tempo" && b.work?.durationMin) {
    const reps = b.repetitions || 1;
    const kmh = b.work.speedTarget?.value ?? 13;
    const workKm = (reps * b.work.durationMin * kmh) / 60;
    const recKm = ((reps - 1) * (b.recovery?.durationMin || 0) * 9) / 60;
    return workKm + recKm;
  }

  // Tempo par distance
  if (b.type === "tempo" && b.work?.distanceKm) {
    return (b.work.distanceKm || 0) * (b.repetitions || 1);
  }

  // Fartlek libre : durée × ~11 km/h (allure mixte)
  if (b.type === "tempo" && b.durationMin) {
    return (b.durationMin * 11) / 60;
  }

  // Cross-training : distance vélo estimée selon l'intensité
  // (les autres cross — natation, renfo, rameur — restent à 0)
  if (b.type === "cross") {
    // Extrait la vitesse vélo selon l'intensité du bloc
    // easy/recovery : ~22 km/h, hard (seuil) : ~28 km/h
    const isBike = b.label === "Vélo" || b.label?.startsWith("Vélo");
    if (!isBike) return 0;
    const speedKmh = b.description?.includes("soutenu")
      ? 28
      : b.description?.includes("modérée")
      ? 22
      : 22;
    return ((b.durationMin || 0) * speedKmh) / 60;
  }

  // Fallback
  return ((b.durationMin || 0) * 10) / 60;
}

// Extrait une moyenne d'une string "11 → 12" ou "5:30 → 5:00"
function averageFromString(s) {
  const nums = String(s).match(/[\d.]+/g);
  if (!nums || nums.length === 0) return 10;
  const vals = nums.map(Number);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ---------------------------------------------------------------------
// Appel principal
// ---------------------------------------------------------------------
// Tolérance adaptative (plus large sur les longues distances) + cible de D+.
// ORS round_trip a tendance à surestimer la distance demandée de 10-15 %.
// Pour compenser : on envoie à ORS une distance REQUISE = target × 0.88.
// Le parcours renvoyé tombe alors proche de la target réelle.
//
// On essaie jusqu'à 4 fois avec des seeds différents. Chaque parcours est
// scoré en combinant (écart distance + écart D+). On retourne :
//   - le 1er parcours qui rentre dans les 2 tolérances, OU
//   - celui avec le meilleur score sinon (flag `_approximate`).
// Stratégie "recherche adaptative" :
// - On commence avec un facteur initial 0.90 (ORS round_trip sur-estime d'environ 10-15 %).
// - Après chaque essai, on RECALIBRE le facteur en fonction du vrai retour ORS.
// - On accepte dès qu'on est dans la tolérance "bonne" (±5 %).
// - En dernier recours (4e essai), on prend la tolérance "acceptable" (±10 %).
const MAX_ATTEMPTS = 4;
const INITIAL_CORRECTION = 0.90;
const GOOD_TOLERANCE = 0.05;       // vise ±5 %
const ACCEPTABLE_TOLERANCE = 0.10; // dernier recours

// Nb de waypoints ORS — moins = boucle plus serrée et distance plus fidèle
function pointsFor(targetKm) {
  if (targetKm > 12) return 2;
  if (targetKm > 6) return 3;
  return 4;
}

export async function fetchRoute({ session, userProfile, seed }) {
  const profile = pickOrsProfile(session, userProfile);
  if (!profile) throw new Error("no_route_for_session_type");
  if (userProfile.locationLat == null || userProfile.locationLng == null) {
    throw new Error("no_location");
  }

  const targetKm = estimateRouteDistance(session, userProfile);
  const orsPoints = pointsFor(targetKm);

  const { preference, elevPerKmMin, elevPerKmMax } = getRouteConstraints(
    session,
    userProfile
  );

  // Pour les séances de côtes, on a besoin d'une côte identifiée dans le
  // parcours. On scanne chaque polyline et on retry si aucune côte valable.
  const needsHillSegment = session.family === "hills";

  let bestGeojson = null;
  let bestScore = Infinity;
  let bestHill = null;
  const attempts = [];
  let correctionFactor = INITIAL_CORRECTION; // on ajuste à chaque tentative

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const attemptSeed =
      seed != null ? seed + attempt * 1000 : Math.floor(Math.random() * 1e6);
    const requestedKm = targetKm * correctionFactor;

    const res = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: userProfile.locationLat,
        lng: userProfile.locationLng,
        distanceKm: requestedKm,
        profile,
        preference,
        seed: attemptSeed,
        points: orsPoints,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = err.detail ? ` — ${String(err.detail).slice(0, 200)}` : "";
      throw new Error(`${err.error || `http_${res.status}`}${detail}`);
    }

    const geojson = await res.json();
    const feature = geojson?.features?.[0];
    const distanceM = feature?.properties?.summary?.distance ?? 0;
    const actualKm = distanceM / 1000;

    // Calcul du D+ depuis les coordonnées
    const coords = feature?.geometry?.coordinates ?? [];
    let totalAscent = 0;
    for (let i = 1; i < coords.length; i++) {
      const d = (coords[i][2] ?? 0) - (coords[i - 1][2] ?? 0);
      if (d > 0) totalAscent += d;
    }
    const elevPerKm = actualKm > 0 ? totalAscent / actualKm : 0;

    const distGap = Math.abs(actualKm - targetKm) / targetKm;
    const distanceGood = distGap <= GOOD_TOLERANCE;
    const distanceAcceptable = distGap <= ACCEPTABLE_TOLERANCE;
    const elevOk = elevPerKm >= elevPerKmMin && elevPerKm <= elevPerKmMax;

    // Si c'est une séance de côtes, on cherche aussi UN bon segment montée
    let hill = null;
    if (needsHillSegment) {
      hill = findBestHillSegment(coords);
    }
    const hillOk = !needsHillSegment || hill !== null;

    const elevGap =
      elevPerKm > elevPerKmMax
        ? (elevPerKm - elevPerKmMax) / Math.max(5, elevPerKmMax)
        : elevPerKm < elevPerKmMin
        ? (elevPerKmMin - elevPerKm) / Math.max(5, elevPerKmMin)
        : 0;
    const hillPenalty = needsHillSegment && !hill ? 5 : 0;
    const score = distGap + elevGap * 1.5 + hillPenalty;

    attempts.push({
      seed: attemptSeed,
      requestedKm: Math.round(requestedKm * 10) / 10,
      actualKm,
      correctionFactor: Math.round(correctionFactor * 100) / 100,
      distGap: Math.round(distGap * 1000) / 10, // en %
      elevPerKm,
      hasHill: !!hill,
      score,
    });

    // Tolérance "bonne" (±5 %) atteinte + contraintes secondaires OK → on s'arrête
    if (distanceGood && elevOk && hillOk) {
      return {
        ...geojson,
        _targetKm: targetKm,
        _actualKm: actualKm,
        _elevPerKm: Math.round(elevPerKm),
        _elevTarget: `${Math.round(elevPerKmMin)}-${Math.round(elevPerKmMax)} m/km`,
        _approximate: false,
        _attempts: attempts.length,
        _attemptsDetail: attempts,
        _hillSegment: hill,
      };
    }

    // On garde le meilleur candidat
    if (score < bestScore) {
      bestScore = score;
      bestGeojson = geojson;
      bestHill = hill;
    }

    // Recalibrage adaptatif : le NOUVEAU facteur compense exactement l'écart observé.
    // Ex: demandé 10 km, reçu 12 km, cible 10 km → nouveau facteur = 0.9 × (10/12) = 0.75
    if (actualKm > 0 && attempt < MAX_ATTEMPTS - 1) {
      correctionFactor = Math.max(
        0.5,
        Math.min(1.3, correctionFactor * (targetKm / actualKm))
      );
    }
  }

  // Aucun parcours ne rentre dans les 2 tolérances → on retourne le meilleur
  const feat = bestGeojson?.features?.[0];
  const bestDistance = feat?.properties?.summary?.distance ?? 0;
  const bestCoords = feat?.geometry?.coordinates ?? [];
  let bestAscent = 0;
  for (let i = 1; i < bestCoords.length; i++) {
    const d = (bestCoords[i][2] ?? 0) - (bestCoords[i - 1][2] ?? 0);
    if (d > 0) bestAscent += d;
  }
  // On flag "approximate" seulement si l'écart dépasse la tolérance acceptable.
  const bestDistGap = Math.abs(bestDistance / 1000 - targetKm) / targetKm;
  const approximate = bestDistGap > ACCEPTABLE_TOLERANCE;
  return {
    ...bestGeojson,
    _targetKm: targetKm,
    _actualKm: bestDistance / 1000,
    _elevPerKm: Math.round(bestAscent / (bestDistance / 1000)),
    _elevTarget: `${Math.round(elevPerKmMin)}-${Math.round(elevPerKmMax)} m/km`,
    _approximate: approximate,
    _attempts: attempts.length,
    _attemptsDetail: attempts,
    _hillSegment: bestHill,
  };
}

// ---------------------------------------------------------------------
// Analyse altimétrique : trouver le meilleur "segment-côte" d'une polyline
// ---------------------------------------------------------------------
// Parcourt la polyline en fenêtre glissante et identifie le tronçon dont
// la longueur + pente correspondent le mieux à un critère "côte".
// Utilisé pour les séances de côtes où l'utilisateur a besoin d'une
// montée précise à répéter.
//
// Coords : tableau de [lng, lat, ele]. ele en mètres.
// Critères par défaut : longueur 80-150 m, pente 5-8 %.
// Retourne { startIdx, endIdx, lengthM, gradient, ascent, score } ou null.

// Distance Haversine en mètres entre deux points [lng, lat]
function haversineM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(a[0] - b[0]) * -1;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function findBestHillSegment(
  coords,
  { minLengthM = 80, maxLengthM = 150, minGrade = 5, maxGrade = 8 } = {}
) {
  if (!coords || coords.length < 5) return null;

  // Pré-calcul des distances cumulées le long de la polyline
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversineM(coords[i - 1], coords[i]));
  }

  let best = null;
  let bestScore = Infinity;

  // Fenêtre glissante : pour chaque point de départ, trouve tous les points
  // d'arrivée qui donnent une longueur dans [minLengthM, maxLengthM].
  for (let i = 0; i < coords.length - 1; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      const lengthM = cum[j] - cum[i];
      if (lengthM < minLengthM) continue;
      if (lengthM > maxLengthM) break; // on a dépassé la fenêtre, on arrête

      // Calcul du dénivelé positif brut du tronçon (ascent seulement)
      let ascent = 0;
      for (let k = i + 1; k <= j; k++) {
        const diff = (coords[k][2] ?? 0) - (coords[k - 1][2] ?? 0);
        if (diff > 0) ascent += diff;
      }
      const gradient = (ascent / lengthM) * 100;

      // Ne garder que les montées continues (sans trop de plat intercalé)
      // → au moins 60 % du dénivelé brut = ascent net
      const netAscent = (coords[j][2] ?? 0) - (coords[i][2] ?? 0);
      if (netAscent < 0) continue; // le tronçon descend globalement
      if (netAscent < ascent * 0.6) continue; // trop de plateau/descente intermédiaire

      // Score : distance à la fourchette idéale
      let score = 0;
      if (gradient < minGrade) score = (minGrade - gradient) * 2;
      else if (gradient > maxGrade) score = (gradient - maxGrade) * 1.5;
      // Bonus pour les longueurs proches du milieu de fourchette
      const midLen = (minLengthM + maxLengthM) / 2;
      score += Math.abs(lengthM - midLen) / 100;

      if (score < bestScore) {
        bestScore = score;
        best = {
          startIdx: i,
          endIdx: j,
          lengthM: Math.round(lengthM),
          gradient: Math.round(gradient * 10) / 10,
          ascent: Math.round(ascent),
          score,
        };
      }
    }
  }

  // On ne retourne que si on a trouvé quelque chose de correct
  // (score < 3 = assez proche des critères)
  if (!best || best.score > 3) return null;
  return best;
}

// ---------------------------------------------------------------------
// Extraction de stats d'un GeoJSON renvoyé par ORS
// ---------------------------------------------------------------------
// IMPORTANT : la durée renvoyée par ORS correspond au profil demandé
// (foot-walking = 5 km/h). Elle n'est donc PAS pertinente pour running.
// On la recalcule depuis l'allure cible de la séance si fournie.
export function extractRouteStats(geojson, session = null) {
  const feature = geojson?.features?.[0];
  if (!feature) return null;
  const props = feature.properties?.summary ?? {};
  const coords = feature.geometry?.coordinates ?? [];

  // Calcul du dénivelé depuis les coordonnées 3D
  let totalAscent = 0;
  let totalDescent = 0;
  for (let i = 1; i < coords.length; i++) {
    const prevEle = coords[i - 1][2] ?? 0;
    const ele = coords[i][2] ?? 0;
    const diff = ele - prevEle;
    if (diff > 0) totalAscent += diff;
    else totalDescent -= diff;
  }

  const distanceKm = Math.round((props.distance ?? 0) / 100) / 10;

  // Durée estimée : on privilégie la durée de la séance (déjà calibrée
  // avec warmup/cooldown/allures réelles). Sinon on estime depuis
  // l'allure moyenne du profil ORS. Jamais la durée ORS brute.
  let durationMin;
  if (session?.totalDurationMin) {
    durationMin = session.totalDurationMin;
  } else {
    // Fallback : vitesse EF typique 10 km/h
    durationMin = Math.round((distanceKm / 10) * 60);
  }

  return {
    distanceKm,
    durationMin,
    ascent: Math.round(totalAscent),
    descent: Math.round(totalDescent),
    coords, // [lng, lat, ele]
  };
}
