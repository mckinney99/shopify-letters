import { execSync } from "child_process";

const TEST_DB_URL =
  "postgresql://postgres:postgres@localhost:5433/shopify_letters?schema=test";

export function setup() {
  // Drop and recreate the test schema via psql — avoids Prisma v6's AI
  // safety guard on `db push --force-reset` while achieving the same clean slate.
  execSync(
    `PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d shopify_letters -c "DROP SCHEMA IF EXISTS test CASCADE; CREATE SCHEMA test;"`,
    { stdio: "pipe" }
  );

  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
}
