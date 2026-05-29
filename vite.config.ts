import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig, type UserConfig } from "vite";
import { resolve } from "path";

// Cloudflare Tunnel terminates TLS at the edge — localhost doesn't need HTTPS.
// basicSsl removed so cloudflared can reach Vite via plain http://localhost:3000.
export default defineConfig({
  resolve: {
    alias: {
      "~": resolve(__dirname, "app"),
    },
  },
  server: {
    port: Number(process.env.PORT || 3000),
    hmr: { port: 8002 },
    allowedHosts: process.env.HOST?.split(",") || [],
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
    }),
  ],
  build: {
    assetsInlineLimit: 0,
  },
}) satisfies UserConfig;
