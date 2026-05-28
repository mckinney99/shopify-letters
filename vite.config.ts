import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig, type UserConfig } from "vite";
import { resolve } from "path";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144584017
// Replace the HOST env var with the actual hostname in URLs
export default defineConfig({
  resolve: {
    alias: {
      "~": resolve(__dirname, "app"),
    },
  },
  server: {
    port: Number(process.env.PORT || 3000),
    hmr: process.env.SHOPIFY_APP_URL
      ? {
          protocol: "wss",
          host: process.env.SHOPIFY_APP_URL.replace(/https?:\/\//, ""),
          port: 8002,
        }
      : { port: 8002 },
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
