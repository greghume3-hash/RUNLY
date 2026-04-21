// Conversion GeoJSON (sortie ORS) → GPX importable dans Garmin Connect,
// Strava, Komoot, et toute app de sport qui accepte les traces standard.
//
// Format : GPX 1.1 avec namespaces de base. On écrit un <rte> (route) et
// pas un <trk> (track) car un parcours sans horodatage = route.
// Garmin Connect accepte les deux en import ; Strava préfère <trk>.
// Pour maximiser la compat, on produit <trk> avec trkseg unique.

export function geojsonToGpx(geojson, { name = "Parcours Runly", description = "" } = {}) {
  const feature = geojson?.features?.[0];
  if (!feature) throw new Error("empty_geojson");

  const coords = feature.geometry?.coordinates ?? [];
  if (coords.length === 0) throw new Error("no_coordinates");

  // Échappement XML pour les champs de texte
  const xmlEscape = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");

  const nowIso = new Date().toISOString();

  const trkpts = coords
    .map(([lng, lat, ele]) => {
      const eleTag = ele != null ? `<ele>${ele}</ele>` : "";
      return `      <trkpt lat="${lat}" lon="${lng}">${eleTag}</trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Runly" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${xmlEscape(name)}</name>
    ${description ? `<desc>${xmlEscape(description)}</desc>` : ""}
    <time>${nowIso}</time>
  </metadata>
  <trk>
    <name>${xmlEscape(name)}</name>
    ${description ? `<desc>${xmlEscape(description)}</desc>` : ""}
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

// Télécharge un fichier GPX (déclenche le "Save As" du navigateur).
export function downloadGpx(gpxString, filename = "parcours.gpx") {
  const blob = new Blob([gpxString], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Partage natif via Web Share API (mobile uniquement). Si pas dispo, fallback download.
export async function shareGpx(gpxString, filename = "parcours.gpx") {
  const blob = new Blob([gpxString], { type: "application/gpx+xml" });
  const file = new File([blob], filename, { type: "application/gpx+xml" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: filename,
      text: "Parcours généré par Runly",
    });
    return true;
  }
  // Fallback : download classique
  downloadGpx(gpxString, filename);
  return false;
}

// "Envoyer sur Strava" — workflow optimisé :
// - Mobile avec Strava installée → Web Share API, Strava apparaît dans le menu
// - Desktop → télécharge le GPX + ouvre strava.com/upload/select dans un nouvel onglet
// Retourne "shared" | "downloaded" | "opened-web"
export async function sendToStrava(gpxString, filename = "parcours.gpx") {
  // Détection grossière mobile (UA)
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const blob = new Blob([gpxString], { type: "application/gpx+xml" });
  const file = new File([blob], filename, { type: "application/gpx+xml" });

  // Cas 1 : partage natif (mobile avec Share API + support des fichiers)
  if (
    isMobile &&
    navigator.canShare &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: filename,
        text: "Parcours Runly — import dans Strava",
      });
      return "shared";
    } catch (e) {
      // l'user a annulé, on tombe en fallback
    }
  }

  // Cas 2 : desktop ou pas de Share API → download + ouvre Strava upload
  downloadGpx(gpxString, filename);
  // Laisse le temps au téléchargement de démarrer avant d'ouvrir l'onglet
  setTimeout(() => {
    window.open("https://www.strava.com/upload/select", "_blank");
  }, 300);
  return "opened-web";
}
