// Netlify Function : proxy vers Nominatim (OpenStreetMap) pour geocoder
// une saisie libre (nom de ville, code postal, adresse) en coordonnées.
//
// Pourquoi un proxy :
// - Nominatim exige un User-Agent identifiable (policy d'usage OSM).
// - Évite les restrictions CORS en production.
// - Permet le cache côté Netlify CDN.
//
// Limite d'usage Nominatim : 1 req/sec par client. Pour un formulaire
// ponctuel par utilisateur c'est largement suffisant.
//
// GET /api/geocode?q=75011
// Retourne un array max 5 résultats : [{ name, lat, lng, type }].

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const q = (event.queryStringParameters?.q || "").trim();
  if (!q || q.length < 2) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([]),
    };
  }

  // Limite de longueur (sécurité simple contre les abus)
  const query = q.slice(0, 100);

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("accept-language", "fr");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim POLICY: User-Agent doit identifier l'application
        "User-Agent": "Runly/1.0 (https://fluffy-marigold-b3c06e.netlify.app)",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: "nominatim_error", status: res.status }),
      };
    }

    const raw = await res.json();
    const results = (Array.isArray(raw) ? raw : []).map((r) => ({
      name: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      type: r.type,
      // Score de pertinence Nominatim
      importance: r.importance ?? 0,
    }));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // Cache 1 h côté CDN (les villes ne bougent pas)
        "Cache-Control": "public, max-age=3600",
      },
      body: JSON.stringify(results),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "fetch_failed", message: String(err) }),
    };
  }
}
