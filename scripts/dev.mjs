#!/usr/bin/env node
/**
 * Dev launcher: Shopify CLI starts Vite, creates the proxy, and manages the
 * tunnel. Do NOT spawn a separate `vite` process — that causes a port conflict
 * where CLI starts its Vite on port 3001 while the standalone one sits on 3000
 * unreachable through the tunnel.
 *
 * stdin is piped (not inherited) to avoid the CLI's readline interface
 * causing EIO errors in the parent process when the TTY closes.
 */

import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

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
  shopify?.kill();
};

process.on("SIGINT", kill);
process.on("SIGTERM", kill);
shopify.on("exit", (code) => { if (code) process.exit(code); });
