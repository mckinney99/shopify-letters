import { describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: "file:./test.db" } },
});

describe("Session DB", () => {
  it("creates and retrieves a session", async () => {
    const created = await prisma.session.create({
      data: {
        id: "test-session-1",
        shop: "test-shop.myshopify.com",
        state: "active",
        isOnline: false,
        accessToken: "shpat_test_token",
      },
    });

    const found = await prisma.session.findUnique({
      where: { id: created.id },
    });

    expect(found?.shop).toBe("test-shop.myshopify.com");
    expect(found?.accessToken).toBe("shpat_test_token");
  });

  it("returns null for a missing session", async () => {
    const found = await prisma.session.findUnique({
      where: { id: "does-not-exist" },
    });

    expect(found).toBeNull();
  });
});
