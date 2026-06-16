import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { action } from "~/routes/webhooks";

// Bypass Shopify webhook authentication so we can call the action directly.
vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(),
  },
}));

import { authenticate } from "~/shopify.server";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:postgres@localhost:5433/shopify_letters?schema=test",
    },
  },
});

const SHOP = "gdpr-integration-test.myshopify.com";
const OTHER_SHOP = "other-shop.myshopify.com";

beforeEach(async () => {
  // Clear only our test shop's data before each test
  await prisma.pricingRule.deleteMany({ where: { shop: SHOP } });
  await prisma.customizationField.deleteMany({ where: { shop: SHOP } });
  await prisma.productConfig.deleteMany({ where: { shop: SHOP } });
  await prisma.session.deleteMany({ where: { shop: SHOP } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => prisma.$disconnect());

async function callShopRedact(): Promise<Response> {
  vi.mocked(authenticate.webhook).mockResolvedValue({
    topic: "SHOP_REDACT",
    shop: SHOP,
    session: null,
    admin: null,
    payload: {},
  } as any);

  return action({
    request: new Request("http://localhost/webhooks", { method: "POST" }),
    params: {},
    context: {},
  }).catch((v) => {
    if (v instanceof Response) return v;
    throw v;
  });
}

async function seedShopData() {
  await prisma.session.create({
    data: {
      id: `session-gdpr-test-${Date.now()}`,
      shop: SHOP,
      state: "active",
      isOnline: false,
      accessToken: "shpat_test",
    },
  });

  const productId = "gid://shopify/Product/99999";

  await prisma.productConfig.create({
    data: { shop: SHOP, productId, enabled: true, published: true },
  });

  const field = await prisma.customizationField.create({
    data: { shop: SHOP, productId, label: "Engraving", type: "text", position: 0 },
  });

  await prisma.pricingRule.create({
    data: {
      shop: SHOP,
      productId,
      fieldId: field.id,
      basePrice: 1.0,
      perCharPrice: 0.25,
      charGroups: {
        create: [{ label: "Uppercase", characters: "A-Z", pricePerChar: 0.5 }],
      },
    },
  });

  return { field };
}

describe("SHOP_REDACT integration — data deletion", () => {
  it("deletes all shop rows and returns 200", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await seedShopData();

    const response = await callShopRedact();
    expect(response.status).toBe(200);

    const [sessions, configs, fields, rules, groups] = await Promise.all([
      prisma.session.findMany({ where: { shop: SHOP } }),
      prisma.productConfig.findMany({ where: { shop: SHOP } }),
      prisma.customizationField.findMany({ where: { shop: SHOP } }),
      prisma.pricingRule.findMany({ where: { shop: SHOP } }),
      prisma.charPriceGroup.findMany({
        where: { rule: { shop: SHOP } },
      }),
    ]);

    expect(sessions).toHaveLength(0);
    expect(configs).toHaveLength(0);
    expect(fields).toHaveLength(0);
    expect(rules).toHaveLength(0);
    expect(groups).toHaveLength(0);
  });

  it("logs gdpr_shop_redact", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await seedShopData();
    await callShopRedact();

    const loggedEvents = spy.mock.calls.map((c) => JSON.parse(c[0] as string));
    const redactLog = loggedEvents.find((e) => e.event === "gdpr_shop_redact");
    expect(redactLog).toBeDefined();
    expect(redactLog!.shop).toBe(SHOP);
  });

  it("does not delete rows for other shops", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    // Seed a row for a different shop
    const otherSession = await prisma.session.create({
      data: {
        id: `session-other-${Date.now()}`,
        shop: OTHER_SHOP,
        state: "active",
        isOnline: false,
        accessToken: "shpat_other",
      },
    });

    await seedShopData();
    await callShopRedact();

    const otherRemains = await prisma.session.findUnique({ where: { id: otherSession.id } });
    expect(otherRemains).not.toBeNull();

    // Cleanup
    await prisma.session.deleteMany({ where: { id: otherSession.id } });
  });
});
