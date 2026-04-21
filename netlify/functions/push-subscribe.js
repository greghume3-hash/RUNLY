// Enregistre une subscription push + les métadonnées pour les notifs.
// Format Netlify Functions v2 (ESM default export) pour accès auto aux Blobs.

import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

function keyOf(endpoint) {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 24);
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { subscription, timezone, schedule } = payload;
  if (
    !subscription?.endpoint ||
    !subscription?.keys?.p256dh ||
    !subscription?.keys?.auth
  ) {
    return new Response(JSON.stringify({ error: "invalid_subscription" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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

  return new Response(JSON.stringify({ ok: true, key }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
