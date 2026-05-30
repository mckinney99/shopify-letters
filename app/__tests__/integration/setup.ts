import { beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: "file:./test.db" } },
});

beforeEach(async () => {
  await prisma.session.deleteMany();
});
