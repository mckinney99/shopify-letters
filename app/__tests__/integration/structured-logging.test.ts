import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { action as previewAction } from "~/routes/api.preview";
import { action as logAction } from "~/routes/api.log";

// Confirms /api/preview and /api/log emit structured JSON logs carrying the
// fields support needs to trace a customer's journey via correlationId
// (preview_request -> add_to_cart -> checkout function logs) — see SL-31.

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:postgres@localhost:5433/shopify_letters?schema=test",
    },
  },
});

const SHOP = "structured-logging-test.myshopify.com";
const PRODUCT_ID = "777";
const PRODUCT_GID = `gid://shopify/Product/${PRODUCT_ID}`;

beforeEach(async () => {
  await prisma.pricingRule.deleteMany({ where: { shop: SHOP } }); // cascades charGroups
  await prisma.customizationField.deleteMany({ where: { shop: SHOP } });
  await prisma.productConfig.deleteMany({ where: { shop: SHOP } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => prisma.$disconnect());

async function seedPublishedProduct() {
  await prisma.productConfig.create({
    data: { shop: SHOP, productId: PRODUCT_GID, enabled: true, published: true },
  });
  const field = await prisma.customizationField.create({
    data: { shop: SHOP, productId: PRODUCT_GID, label: "Engraving", type: "text", minChars: 1, maxChars: 20, position: 0 },
  });
  await prisma.pricingRule.create({
    data: { shop: SHOP, productId: PRODUCT_GID, fieldId: "", basePrice: 5.0, perCharPrice: 0 },
  });
  await prisma.pricingRule.create({
    data: { shop: SHOP, productId: PRODUCT_GID, fieldId: field.id, basePrice: 0, perCharPrice: 0.5 },
  });
  return { field };
}

function lastJsonLog(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const calls = spy.mock.calls;
  return JSON.parse(calls[calls.length - 1][0] as string);
}

describe("POST /api/preview structured logging", () => {
  it("logs a preview_request event with shop, productId, correlationId, inputHash, valid, priceMinor, latencyMs", async () => {
    const { field } = await seedPublishedProduct();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const request = new Request("http://localhost/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop: SHOP,
        productId: PRODUCT_ID,
        fields: { [field.id]: "Hello" },
        correlationId: "corr-123",
      }),
    });

    const response = await previewAction({ request, params: {}, context: {} });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.price).toBe(750); // $5 base + 5 chars * $0.50

    const logged = lastJsonLog(spy);
    expect(logged.event).toBe("preview_request");
    expect(logged.shop).toBe(SHOP);
    expect(logged.productId).toBe(PRODUCT_GID);
    expect(logged.correlationId).toBe("corr-123");
    expect(logged.valid).toBe(true);
    expect(logged.priceMinor).toBe(750);
    expect(typeof logged.inputHash).toBe("string");
    expect(logged.inputHash).toMatch(/^[0-9a-f]{12}$/);
    expect(typeof logged.latencyMs).toBe("number");
  });

  it("logs correlationId as null when the storefront didn't send one", async () => {
    const { field } = await seedPublishedProduct();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const request = new Request("http://localhost/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop: SHOP, productId: PRODUCT_ID, fields: { [field.id]: "Hi" } }),
    });

    await previewAction({ request, params: {}, context: {} });

    const logged = lastJsonLog(spy);
    expect(logged.correlationId).toBeNull();
  });

  it("the same field values produce the same inputHash regardless of key order", async () => {
    const { field } = await seedPublishedProduct();
    await prisma.customizationField.create({
      data: { shop: SHOP, productId: PRODUCT_GID, label: "Other", type: "text", position: 1 },
    });
    const otherFields = await prisma.customizationField.findMany({ where: { shop: SHOP, productId: PRODUCT_GID } });
    const otherField = otherFields.find((f) => f.id !== field.id)!;

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const makeRequest = (fields: Record<string, string>) =>
      new Request("http://localhost/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop: SHOP, productId: PRODUCT_ID, fields }),
      });

    await previewAction({
      request: makeRequest({ [field.id]: "Hello", [otherField.id]: "World" }),
      params: {},
      context: {},
    });
    const firstHash = lastJsonLog(spy).inputHash;

    await previewAction({
      request: makeRequest({ [otherField.id]: "World", [field.id]: "Hello" }),
      params: {},
      context: {},
    });
    const secondHash = lastJsonLog(spy).inputHash;

    expect(secondHash).toBe(firstHash);
  });
});

describe("POST /api/log structured logging", () => {
  it("logs an add_to_cart event with shop, productId, correlationId, payloadSize", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const request = new Request("http://localhost/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop: SHOP, productId: PRODUCT_ID, correlationId: "corr-123", payloadSize: 42 }),
    });

    const response = await logAction({ request, params: {}, context: {} });
    expect(response.status).toBe(200);

    const logged = lastJsonLog(spy);
    expect(logged.event).toBe("add_to_cart");
    expect(logged.shop).toBe(SHOP);
    expect(logged.productId).toBe(PRODUCT_GID);
    expect(logged.correlationId).toBe("corr-123");
    expect(logged.payloadSize).toBe(42);
  });

  it("rejects requests missing shop or productId", async () => {
    const request = new Request("http://localhost/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ correlationId: "corr-123" }),
    });

    const response = await logAction({ request, params: {}, context: {} });
    expect(response.status).toBe(400);
  });
});
