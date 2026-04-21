// Script pour générer une paire de clés VAPID (à exécuter 1 fois).
// Usage :
//   node scripts/generate-vapid.mjs
// Copie les clés affichées dans les env vars Netlify :
//   VAPID_PUBLIC_KEY  → utilisé par le frontend ET le backend
//   VAPID_PRIVATE_KEY → UNIQUEMENT backend (garde-la secrète)

import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.log("\n✅ VAPID keys générées.\n");
console.log("À coller dans Netlify > Site settings > Environment variables :\n");
console.log("---");
console.log("VAPID_PUBLIC_KEY =");
console.log(keys.publicKey);
console.log();
console.log("VAPID_PRIVATE_KEY =");
console.log(keys.privateKey);
console.log("---\n");
console.log("⚠️  VAPID_PRIVATE_KEY doit rester SECRÈTE. Ne la commit jamais, ne la partage pas.\n");
