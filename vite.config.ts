import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig, type UserConfig } from "vite";
import { resolve } from "path";
import basicSsl from "@vitejs/plugin-basic-ssl";

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
    hmr: { port: 8002 },
    allowedHosts: process.env.HOST?.split(",") || [],
    // Forces Vite to use https.createServer (HTTP/1.1) instead of
    // http2.createSecureServer — connect middleware breaks on h2 requests
    // where req.url is undefined. See resolveHttpServer in Vite source.
    proxy: {},
  },
  plugins: [
    basicSsl(),
    remix({
      ignoredRouteFiles: ["**/.*"],
    }),
    {
      name: "strip-http2-pseudo-headers",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          for (const key of Object.keys(req.headers)) {
            if (key.startsWith(":")) delete (req.headers as Record<string, unknown>)[key];
          }
          next();
        });
      },
    },
  ],
  build: {
    assetsInlineLimit: 0,
  },
}) satisfies UserConfig;
