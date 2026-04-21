// Supprime une subscription push.

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
  const endpoint = payload?.subscription?.endpoint;
  if (!endpoint) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing_endpoint" }) };
  }

  const store = getStore("runly-push");
  await store.delete(keyOf(endpoint));
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}
