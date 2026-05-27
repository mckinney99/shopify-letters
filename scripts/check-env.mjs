#!/usr/bin/env node
/**
 * Validates required environment variables before dev/start.
 * Run via: npm run check-env
 * Called automatically by: npm run dev, npm run start
 */

const REQUIRED = [
  {
    key: "SHOPIFY_API_KEY",
    hint: "Get this from partners.shopify.com → Apps → your app → API credentials",
  },
  {
    key: "SHOPIFY_API_SECRET",
    hint: "Get this from partners.shopify.com → Apps → your app → API credentials",
  },
  {
    key: "SCOPES",
    hint: 'Set to: read_products,write_products,read_orders,write_orders (or copy from .env.example)',
  },
  {
    key: "DATABASE_URL",
    hint: 'Set to: file:./dev.db  for local development (SQLite)',
  },
];

// SHOPIFY_APP_URL is set automatically by `shopify app dev` — not required manually
const OPTIONAL_INFO = [
  "SHOPIFY_APP_URL — set automatically by `shopify app dev`, leave blank in .env",
];

let missing = [];

for (const { key, hint } of REQUIRED) {
  if (!process.env[key]) {
    missing.push({ key, hint });
  }
}

if (missing.length > 0) {
  console.error("\n❌  Missing required environment variables:\n");
  for (const { key, hint } of missing) {
    console.error(`  ${key}`);
    console.error(`    → ${hint}\n`);
  }
  console.error("  Copy .env.example to .env and fill in the missing values:");
  console.error("    cp .env.example .env\n");
  process.exit(1);
}

console.log("✅  Environment looks good — all required vars are set.");
