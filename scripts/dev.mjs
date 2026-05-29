#!/usr/bin/env node
/**
 * Dev launcher: Vite on port 3000 (HTTP), Shopify CLI creates the tunnel and
 * proxy. The tunnel routes directly to http://localhost:3000 — Shopify CLI does
 * NOT start Vite itself, it only manages the cloudflared tunnel and GraphQL proxy.
 *
 * basicSsl must NOT be used — cloudflared can only forward to HTTP origins.
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
  shopify?.kill();
};

process.on("SIGINT", kill);
process.on("SIGTERM", kill);
vite.on("exit", (code) => { if (code) process.exit(code); });
shopify.on("exit", (code) => { if (code) process.exit(code); });
