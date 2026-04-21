// Enregistre une subscription push + les métadonnées nécessaires pour
// savoir QUAND envoyer les notifications (timezone, planning séances).
//
// Stockage : Netlify Blobs (clé = endpoint hashé, valeur = subscription JSON).
//
// Body attendu :
// {
//   subscription: { endpoint, keys: { p256dh, auth } },
//   timezone: "Europe/Paris",
//   schedule: [
//     { date: "2026-04-21", isMorning: true, body: "..." },
//     { date: "2026-04-20", isEvening: true, body: "..." },
//     ...
//   ]
// }

import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

function keyOf(endpoint) {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 24);
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
  }

  const { subscription, timezone, schedule } = payload;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_subscription" }) };
  }

  const store = getStore("runly-push");
  const key = keyOf(subscription.endpoint);
  const record = {
    subscription,
    timezone: timezone || "Europe/Paris",
    schedule: Array.isArray(schedule) ? schedule.slice(0, 200) : [],
    updatedAt: new Date().toISOString(),
  };
  await store.setJSON(key, record);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, key }),
  };
}
