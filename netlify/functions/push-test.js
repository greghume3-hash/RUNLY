// Envoie une notification test à une subscription. Format v2.

import webpush from "web-push";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    return new Response(JSON.stringify({ error: "missing_vapid_keys" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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
  const { subscription } = payload;
  if (!subscription?.endpoint) {
    return new Response(JSON.stringify({ error: "missing_subscription" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  webpush.setVapidDetails("mailto:contact@runly.local", pub, priv);

  const notifPayload = JSON.stringify({
    title: "Runly 🏃",
    body: "Notification test OK ! Tu recevras tes rappels de séance à l'heure prévue.",
    tag: "runly-test",
    url: "/",
  });

  try {
    await webpush.sendNotification(subscription, notifPayload);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "send_failed",
        status: err?.statusCode,
        message: String(err),
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
};
