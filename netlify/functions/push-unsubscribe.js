// Supprime une subscription push. Format v2.

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
  const endpoint = payload?.subscription?.endpoint;
  if (!endpoint) {
    return new Response(JSON.stringify({ error: "missing_endpoint" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const store = getStore("runly-push");
  await store.delete(keyOf(endpoint));
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
