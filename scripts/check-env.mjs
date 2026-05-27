#!/usr/bin/env node
/**
 * Validates required environment variables before dev/start.
 * Run via: npm run check-env
 * Called automatically by: npm run dev, npm run start
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load .env so this script works when called directly by npm scripts
// (Node doesn't auto-load .env — shopify app dev does it later in the chain)
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

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
