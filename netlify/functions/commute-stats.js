// Netlify Function : calcule la distance + dénivelé d'un trajet vélo
// domicile → travail via OpenRouteService.
//
// Appel : POST /api/commute-stats
// Body : { homeLat, homeLng, workLat, workLng }
// Retour : { distanceKm, elevationM, durationMin }

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "missing_api_key" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
  }

  const { homeLat, homeLng, workLat, workLng } = payload;
  if (
    typeof homeLat !== "number" ||
    typeof homeLng !== "number" ||
    typeof workLat !== "number" ||
    typeof workLng !== "number"
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "invalid_params",
        message: "homeLat, homeLng, workLat, workLng requis.",
      }),
    };
  }

  // Profil "cycling-regular" = vélo urbain standard (gère pistes cyclables)
  const url =
    "https://api.openrouteservice.org/v2/directions/cycling-regular/geojson";
  const body = {
    coordinates: [
      [homeLng, homeLat],
      [workLng, workLat],
    ],
    elevation: true,
    instructions: false,
    geometry_simplify: true,
  };

  try {
    const res = await fetch(url, {
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
      return {
        statusCode: res.status,
        body: JSON.stringify({
          error: "ors_error",
          status: res.status,
          detail: text.slice(0, 500),
        }),
      };
    }
    const data = JSON.parse(text);
    const feature = data?.features?.[0];
    const summary = feature?.properties?.summary ?? {};
    const coords = feature?.geometry?.coordinates ?? [];

    // Calcul D+ depuis les coordonnées 3D
    let ascent = 0;
    for (let i = 1; i < coords.length; i++) {
      const d = (coords[i][2] ?? 0) - (coords[i - 1][2] ?? 0);
      if (d > 0) ascent += d;
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
      body: JSON.stringify({
        distanceKm: Math.round((summary.distance ?? 0) / 100) / 10,
        elevationM: Math.round(ascent),
        durationMin: Math.round((summary.duration ?? 0) / 60),
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "fetch_failed", message: String(err) }),
    };
  }
}
