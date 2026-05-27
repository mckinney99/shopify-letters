import { execSync } from "child_process";
import { beforeAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const TEST_DB_URL = "file:./test.db";

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});

beforeAll(() => {
  execSync("npx prisma db push --force-reset --skip-generate", {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
});

beforeEach(async () => {
  await prisma.session.deleteMany();
});
