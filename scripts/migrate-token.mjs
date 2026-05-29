#!/usr/bin/env node
/**
 * One-time migration: exchange non-expiring shpat_ token for a new expiring token.
 * Shopify deprecated non-expiring offline tokens in Dec 2025 — all Admin API calls
 * with shpat_ tokens now return 403.
 *
 * Run once: node scripts/migrate-token.mjs
 * Then restart dev. The new token expires in 1 hour; unstable_newEmbeddedAuthStrategy
 * re-exchanges via App Bridge JWT automatically on each subsequent request.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Parse .env manually
const env = readFileSync(resolve(ROOT, ".env"), "utf8");
const getEnv = (key) => {
  const m = env.match(new RegExp(`^${key}=(.+)$`, "m"));
  return m?.[1]?.trim();
};

const CLIENT_ID = getEnv("SHOPIFY_API_KEY");
const CLIENT_SECRET = getEnv("SHOPIFY_API_SECRET");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("SHOPIFY_API_KEY or SHOPIFY_API_SECRET missing from .env");
  process.exit(1);
}

const prisma = new PrismaClient();

const session = await prisma.session.findFirst({ where: { isOnline: false } });
if (!session) {
  console.error("No offline session found in DB — start dev and open the app first.");
  process.exit(1);
}

console.log("Shop:", session.shop);
console.log("Current token prefix:", session.accessToken.slice(0, 12));
console.log("Current scope:", session.scope);

const params = new URLSearchParams({
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
  subject_token: session.accessToken,
  subject_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
  requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
  expiring: "1",
});

console.log("\nCalling migration token exchange...");
const res = await fetch(`https://${session.shop}/admin/oauth/access_token`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
  },
  body: params.toString(),
});

console.log("HTTP status:", res.status);
const body = await res.json();
console.log("Response keys:", Object.keys(body));

if (!res.ok || !body.access_token) {
  console.error("Migration failed:", JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log("\nNew token prefix:", body.access_token.slice(0, 12));
console.log("Expires in (seconds):", body.expires_in);
console.log("Has refresh token:", !!body.refresh_token);

// Update the DB session with the new expiring token
const expiresAt = body.expires_in
  ? new Date(Date.now() + body.expires_in * 1000)
  : null;

await prisma.session.update({
  where: { id: session.id },
  data: {
    accessToken: body.access_token,
    expires: expiresAt,
  },
});

console.log("\n✅ Session updated.");
console.log("New token prefix:", body.access_token.slice(0, 12));
console.log("Expires at:", expiresAt?.toISOString() ?? "null");

// Verify the new token works
console.log("\nVerifying new token...");
const verifyRes = await fetch(
  `https://${session.shop}/admin/api/2025-10/graphql.json`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": body.access_token,
    },
    body: JSON.stringify({ query: "{ shop { name } }" }),
  }
);
console.log("Verify HTTP status:", verifyRes.status);
const verifyBody = await verifyRes.json();
console.log("Verify response:", JSON.stringify(verifyBody).slice(0, 200));

await prisma.$disconnect();
