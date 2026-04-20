// Netlify Function : proxy vers OpenRouteService pour générer
// un parcours en boucle depuis un point de départ.
//
// Sécurité : la clé API ORS est lue depuis les variables d'environnement
// Netlify (jamais dans le code frontend, jamais dans le repo).
//
// Endpoint côté client : POST /api/route
// Body JSON : {
//   lat: number,
//   lng: number,
//   distanceKm: number,
//   profile?: "foot-walking" | "foot-hiking" | "cycling-regular",
//   seed?: number  // pour reproductibilité ou variante différente
// }
// Réponse : GeoJSON FeatureCollection avec le parcours généré.

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "missing_api_key",
        message: "ORS_API_KEY non configurée côté serveur.",
      }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
  }

  const {
    lat,
    lng,
    distanceKm,
    profile = "foot-walking",
    seed,
  } = payload;

  // Validation basique
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    typeof distanceKm !== "number" ||
    distanceKm <= 0 ||
    distanceKm > 80
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "invalid_params",
        message: "lat, lng et distanceKm (1-80) sont requis.",
      }),
    };
  }

  // Profils supportés (limite aux usages running + cross-training vélo)
  const allowedProfiles = [
    "foot-walking",
    "foot-hiking",
    "cycling-regular",
    "cycling-mountain",
    "cycling-road",
  ];
  if (!allowedProfiles.includes(profile)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "invalid_profile" }),
    };
  }

  // Appel à OpenRouteService — round-trip = boucle aléatoire
  const orsUrl = `https://api.openrouteservice.org/v2/directions/${profile}/geojson`;
  const body = {
    coordinates: [[lng, lat]],
    options: {
      round_trip: {
        length: Math.round(distanceKm * 1000), // mètres
        // 3 waypoints = boucle plus serrée, distance plus proche de la cible.
        // (5 = boucle sinueuse mais distance souvent surestimée)
        points: 3,
        seed: typeof seed === "number" ? seed : Math.floor(Math.random() * 1e6),
      },
    },
    elevation: true,
    instructions: false,
    geometry_simplify: true,
  };

  try {
    const res = await fetch(orsUrl, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/geo+json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      // On propage le code + un message utile sans exposer la clé
      return {
        statusCode: res.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "ors_error",
          status: res.status,
          detail: text.slice(0, 500),
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // Le résultat est spécifique au seed, cache court côté CDN
        "Cache-Control": "public, max-age=300",
      },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "fetch_failed", message: String(err) }),
    };
  }
}
