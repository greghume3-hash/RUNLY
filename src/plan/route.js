// Service frontend : appelle la Netlify Function /api/route pour
// générer un parcours en boucle depuis la position de l'utilisateur,
// adapté au type de séance.

// ---------------------------------------------------------------------
// Choix du profil ORS selon la séance
// ---------------------------------------------------------------------
// foot-walking → route, bitume, trottoirs (footings urbains)
// foot-hiking  → chemins, sentiers (trails)
// cycling-*    → pour les séances de cross-training vélo
function pickOrsProfile(session, userProfile) {
  if (session.type === "cross") {
    // On ne suggère pas de parcours pour cross sauf si c'est vélo
    if (session.family === "cross" && session.blocks[0]?.label === "Vélo") {
      return "cycling-regular";
    }
    return null;
  }

  // Objectif trail OU terrain préféré = chemins
  const obj = userProfile.objectiveCategory;
  const terrain = userProfile.preferredTerrain;
  if (obj === "trail" || terrain === "path") return "foot-hiking";
  return "foot-walking";
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
// Tolérance de ±10 % sur la distance. On retry jusqu'à 3 fois avec
// des seeds différents si ORS renvoie hors tolérance. Après 3 essais,
// on garde le meilleur et on flag `approximate: true`.
const TOLERANCE = 0.10;
const MAX_ATTEMPTS = 3;

export async function fetchRoute({ session, userProfile, seed }) {
  const profile = pickOrsProfile(session, userProfile);
  if (!profile) {
    throw new Error("no_route_for_session_type");
  }
  if (userProfile.locationLat == null || userProfile.locationLng == null) {
    throw new Error("no_location");
  }

  const targetKm = estimateRouteDistance(session);
  const minKm = targetKm * (1 - TOLERANCE);
  const maxKm = targetKm * (1 + TOLERANCE);

  let best = null;
  let bestGap = Infinity;
  const attempts = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Seed différent à chaque essai (déterministe si caller fournit un seed)
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
        seed: attemptSeed,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = err.detail ? ` — ${String(err.detail).slice(0, 200)}` : "";
      // Erreur API : inutile de retry sauf si c'est un souci réseau transitoire
      throw new Error(`${err.error || `http_${res.status}`}${detail}`);
    }

    const geojson = await res.json();
    const distanceM = geojson?.features?.[0]?.properties?.summary?.distance ?? 0;
    const actualKm = distanceM / 1000;
    const gap = Math.abs(actualKm - targetKm);
    attempts.push({ seed: attemptSeed, actualKm, gap });

    // Dans la tolérance → on s'arrête
    if (actualKm >= minKm && actualKm <= maxKm) {
      return {
        ...geojson,
        _targetKm: targetKm,
        _actualKm: actualKm,
        _approximate: false,
        _attempts: attempts.length,
      };
    }

    // Sinon on garde le meilleur
    if (gap < bestGap) {
      bestGap = gap;
      best = geojson;
    }
  }

  // Les 3 tentatives ont échoué → on retourne le meilleur avec un flag
  const bestDistance = best?.features?.[0]?.properties?.summary?.distance ?? 0;
  return {
    ...best,
    _targetKm: targetKm,
    _actualKm: bestDistance / 1000,
    _approximate: true,
    _attempts: attempts.length,
  };
}

// ---------------------------------------------------------------------
// Extraction de stats d'un GeoJSON renvoyé par ORS
// ---------------------------------------------------------------------
export function extractRouteStats(geojson) {
  const feature = geojson?.features?.[0];
  if (!feature) return null;
  const props = feature.properties?.summary ?? {};
  // L'élévation est dans les coordonnées (lng, lat, ele) si elevation: true
  const coords = feature.geometry?.coordinates ?? [];
  let totalAscent = 0;
  let totalDescent = 0;
  for (let i = 1; i < coords.length; i++) {
    const prevEle = coords[i - 1][2] ?? 0;
    const ele = coords[i][2] ?? 0;
    const diff = ele - prevEle;
    if (diff > 0) totalAscent += diff;
    else totalDescent -= diff;
  }
  return {
    distanceKm: Math.round((props.distance ?? 0) / 100) / 10, // arrondi 0.1 km
    durationMin: Math.round((props.duration ?? 0) / 60),
    ascent: Math.round(totalAscent),
    descent: Math.round(totalDescent),
    coords, // [lng, lat, ele]
  };
}
