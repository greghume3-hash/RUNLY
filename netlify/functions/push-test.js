// Envoie une notification test à une subscription donnée.
// Utilisé par le bouton "Envoyer test" dans l'app.

import webpush from "web-push";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405 };

  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "missing_vapid_keys" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid_json" }) };
  }
  const { subscription } = payload;
  if (!subscription?.endpoint) {
    return { statusCode: 400, body: JSON.stringify({ error: "missing_subscription" }) };
  }

  webpush.setVapidDetails(
    "mailto:contact@runly.local",
    pub,
    priv
  );

  const notifPayload = JSON.stringify({
    title: "Runly 🏃",
    body: "Notification test OK ! Tu recevras tes rappels de séance à l'heure prévue.",
    tag: "runly-test",
    url: "/",
  });

  try {
    await webpush.sendNotification(subscription, notifPayload);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "send_failed", message: String(err) }),
    };
  }
}
