import { beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:postgres@localhost:5432/shopify_letters?schema=test",
    },
  },
});

beforeEach(async () => {
  await prisma.session.deleteMany();
});
