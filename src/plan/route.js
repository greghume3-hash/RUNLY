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
// On utilise l'allure moyenne des blocs pour estimer la distance parcourue.
// Fallback : 10 km/h (allure EF moyenne).
export function estimateRouteDistance(session) {
  if (session.totalDistanceKm) return session.totalDistanceKm;

  const totalMin = session.totalDurationMin || 45;
  // Vitesse pondérée : pour les séances avec intervalles, on reste modeste
  // car l'allure moyenne (échauffement + intervalles courts + récup) tourne
  // autour de 10-11 km/h même si les intervalles sont rapides.
  const avgKmh = {
    recovery: 9,
    easy: 10.5,
    cross: 20, // vélo
    long: 10,
    tempo: 12,
    intervals: 10.5,
    hills: 9.5,
  }[session.type] ?? 10;

  return Math.round((totalMin * avgKmh) / 60 * 10) / 10;
}

// ---------------------------------------------------------------------
// Appel principal
// ---------------------------------------------------------------------
export async function fetchRoute({ session, userProfile, seed }) {
  const profile = pickOrsProfile(session, userProfile);
  if (!profile) {
    throw new Error("no_route_for_session_type");
  }
  if (userProfile.locationLat == null || userProfile.locationLng == null) {
    throw new Error("no_location");
  }

  const distanceKm = estimateRouteDistance(session);

  const res = await fetch("/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lat: userProfile.locationLat,
      lng: userProfile.locationLng,
      distanceKm,
      profile,
      seed,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `http_${res.status}`);
  }
  return res.json();
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
