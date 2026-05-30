import { defineWorkspace } from "vitest/config";
import { resolve } from "path";

const alias = { "~": resolve(__dirname, "app") };

export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: "unit",
      include: ["app/__tests__/unit/**/*.test.ts"],
      environment: "node",
    },
  },
  {
    resolve: { alias },
    test: {
      name: "integration",
      include: ["app/__tests__/integration/**/*.test.ts"],
      environment: "node",
      globalSetup: ["app/__tests__/integration/global-setup.ts"],
      setupFiles: ["app/__tests__/integration/setup.ts"],
      env: {
        DATABASE_URL: "file:./test.db",
      },
    },
  },
]);
