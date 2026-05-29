#!/usr/bin/env node
/**
 * Dev launcher:
 *   1. Vite on port 3000 (HTTP — no basicSsl)
 *   2. cloudflared named tunnel "shopify-dev" routes etch.direct → localhost:3000
 *   3. Shopify CLI manages GraphQL proxy and Partner Dashboard sync
 *
 * stdin is piped (not inherited) to avoid the CLI's readline interface
 * causing EIO errors in the parent process when the TTY closes.
 */

import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const vite = spawn("npx", ["vite"], {
  env: process.env,
  stdio: "inherit",
  cwd: ROOT,
});

const tunnel = spawn("cloudflared", ["tunnel", "run", "shopify-dev"], {
  env: process.env,
  stdio: "inherit",
  cwd: ROOT,
});

const shopify = spawn(
  "npx",
  ["shopify", "app", "dev", "-c", "etch"],
  { env: process.env, stdio: ["pipe", "inherit", "inherit"], cwd: ROOT },
);

// Forward terminal keystrokes to CLI so (p)(a)(q) shortcuts work.
process.stdin.pipe(shopify.stdin);
process.stdin.on("error", () => {});
shopify.stdin.on("error", () => {});

const kill = () => {
  vite?.kill();
  tunnel?.kill();
  shopify?.kill();
};

process.on("SIGINT", kill);
process.on("SIGTERM", kill);
vite.on("exit", (code) => { if (code) process.exit(code); });
tunnel.on("exit", (code) => { if (code) process.exit(code); });
shopify.on("exit", (code) => { if (code) process.exit(code); });
