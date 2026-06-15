import { execSync } from "child_process";

export function setup() {
  execSync("npx prisma db push --force-reset --skip-generate", {
    env: {
      ...process.env,
      DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5433/shopify_letters?schema=test",
    },
    stdio: "pipe",
  });
}
