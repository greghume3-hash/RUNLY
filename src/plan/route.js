// Service frontend : appelle la Netlify Function /api/route pour
// générer un parcours en boucle depuis la position de l'utilisateur,
// adapté au type de séance.

// ---------------------------------------------------------------------
// Choix du profil ORS selon la séance
// ---------------------------------------------------------------------
function pickOrsProfile(session, userProfile) {
  if (session.type === "cross") {
    if (session.family === "cross" && session.blocks[0]?.label === "Vélo") {
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
// chaque bloc avec SA vitesse cible propre (pas une moyenne forfaitaire).
export function estimateRouteDistance(session) {
  if (session.totalDistanceKm) return Math.round(session.totalDistanceKm * 10) / 10;

  // Fallback sur le type si aucun bloc lisible
  if (!Array.isArray(session.blocks) || session.blocks.length === 0) {
    const avgKmh = { recovery: 9, easy: 10.5, cross: 20, long: 10, tempo: 12, intervals: 10.5, hills: 9.5 }[session.type] ?? 10;
    return Math.round((session.totalDurationMin || 45) * avgKmh / 60 * 10) / 10;
  }

  let totalKm = 0;
  for (const b of session.blocks) {
    totalKm += distanceForBlock(b);
  }
  return Math.round(totalKm * 10) / 10;
}

// Calcule la distance d'un bloc selon sa nature.
function distanceForBlock(b) {
  // Warmup / cooldown / easy / recovery : durée × vitesse du bloc
  if (b.type === "warmup" || b.type === "cooldown" || b.type === "easy" || b.type === "recovery") {
    const kmh = b.speedTarget?.value ?? b.speedTarget?.min ?? 10;
    // Si speedTarget est un string (ex: "11 → 12"), on prend le milieu
    const speed = typeof kmh === "string" ? averageFromString(kmh) : Number(kmh);
    return ((b.durationMin || 0) * speed) / 60;
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

  // Cross-training : pas compté en distance running
  if (b.type === "cross") return 0;

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
// Tolérance ±10 % sur la distance + cible de D+ (m/km) selon la séance.
// On essaie jusqu'à 4 fois avec des seeds différents. Chaque parcours est
// scoré en combinant (écart distance + écart D+). On retourne :
//   - le 1er parcours qui rentre dans les 2 tolérances, OU
//   - celui avec le meilleur score sinon (flag `_approximate`).
const TOLERANCE = 0.10;
const MAX_ATTEMPTS = 4;

export async function fetchRoute({ session, userProfile, seed }) {
  const profile = pickOrsProfile(session, userProfile);
  if (!profile) throw new Error("no_route_for_session_type");
  if (userProfile.locationLat == null || userProfile.locationLng == null) {
    throw new Error("no_location");
  }

  const targetKm = estimateRouteDistance(session);
  const minKm = targetKm * (1 - TOLERANCE);
  const maxKm = targetKm * (1 + TOLERANCE);

  const { preference, elevPerKmMin, elevPerKmMax } = getRouteConstraints(
    session,
    userProfile
  );

  let bestGeojson = null;
  let bestScore = Infinity;
  const attempts = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const attemptSeed =
      seed != null ? seed + attempt * 1000 : Math.floor(Math.random() * 1e6);

    const res = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: userProfile.locationLat,
        lng: userProfile.locationLng,
        distanceKm: targetKm,
        profile,
        preference,
        seed: attemptSeed,
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

    const distanceOk = actualKm >= minKm && actualKm <= maxKm;
    const elevOk = elevPerKm >= elevPerKmMin && elevPerKm <= elevPerKmMax;

    // Score combiné : plus c'est bas, meilleur c'est
    const distGap = Math.abs(actualKm - targetKm) / targetKm;
    const elevGap =
      elevPerKm > elevPerKmMax
        ? (elevPerKm - elevPerKmMax) / Math.max(5, elevPerKmMax)
        : elevPerKm < elevPerKmMin
        ? (elevPerKmMin - elevPerKm) / Math.max(5, elevPerKmMin)
        : 0;
    const score = distGap + elevGap * 1.5; // on pondère légèrement le dénivelé

    attempts.push({ seed: attemptSeed, actualKm, elevPerKm, score });

    // Les 2 tolérances sont respectées → on s'arrête
    if (distanceOk && elevOk) {
      return {
        ...geojson,
        _targetKm: targetKm,
        _actualKm: actualKm,
        _elevPerKm: Math.round(elevPerKm),
        _elevTarget: `${Math.round(elevPerKmMin)}-${Math.round(elevPerKmMax)} m/km`,
        _approximate: false,
        _attempts: attempts.length,
      };
    }

    if (score < bestScore) {
      bestScore = score;
      bestGeojson = geojson;
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
  return {
    ...bestGeojson,
    _targetKm: targetKm,
    _actualKm: bestDistance / 1000,
    _elevPerKm: Math.round(bestAscent / (bestDistance / 1000)),
    _elevTarget: `${elevPerKmMin}-${elevPerKmMax} m/km`,
    _approximate: true,
    _attempts: attempts.length,
  };
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
