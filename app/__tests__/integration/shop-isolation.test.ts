import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:postgres@localhost:5432/shopify_letters?schema=test",
    },
  },
});

const SHOP_A = "shop-a.myshopify.com";
const SHOP_B = "shop-b.myshopify.com";
const PRODUCT_GID = "gid://shopify/Product/999";

describe("Shop isolation", () => {
  beforeEach(async () => {
    await prisma.charPriceGroup.deleteMany();
    await prisma.pricingRule.deleteMany();
    await prisma.customizationField.deleteMany();
    await prisma.productConfig.deleteMany();
  });

  it("CustomizationField: shop B cannot read shop A records", async () => {
    await prisma.customizationField.create({
      data: { shop: SHOP_A, productId: PRODUCT_GID, label: "Name", position: 0 },
    });

    const result = await prisma.customizationField.findMany({
      where: { shop: SHOP_B, productId: PRODUCT_GID },
    });

    expect(result).toHaveLength(0);
  });

  it("CustomizationField: updateMany with wrong shop is a no-op", async () => {
    const field = await prisma.customizationField.create({
      data: { shop: SHOP_A, productId: PRODUCT_GID, label: "Original", position: 0 },
    });

    await prisma.customizationField.updateMany({
      where: { id: field.id, shop: SHOP_B },
      data: { label: "Tampered" },
    });

    const unchanged = await prisma.customizationField.findUnique({ where: { id: field.id } });
    expect(unchanged?.label).toBe("Original");
  });

  it("CustomizationField: deleteMany with wrong shop is a no-op", async () => {
    await prisma.customizationField.create({
      data: { shop: SHOP_A, productId: PRODUCT_GID, label: "To Keep", position: 0 },
    });

    await prisma.customizationField.deleteMany({
      where: { shop: SHOP_B, productId: PRODUCT_GID },
    });

    const remaining = await prisma.customizationField.findMany({
      where: { shop: SHOP_A, productId: PRODUCT_GID },
    });
    expect(remaining).toHaveLength(1);
  });

  it("ProductConfig: shop B cannot read shop A record", async () => {
    await prisma.productConfig.create({
      data: { shop: SHOP_A, productId: PRODUCT_GID, enabled: true, published: true },
    });

    const result = await prisma.productConfig.findUnique({
      where: { shop_productId: { shop: SHOP_B, productId: PRODUCT_GID } },
    });

    expect(result).toBeNull();
  });

  it("PricingRule: shop B cannot read shop A records", async () => {
    await prisma.pricingRule.create({
      data: { shop: SHOP_A, productId: PRODUCT_GID, fieldId: "", basePrice: 5.0 },
    });

    const result = await prisma.pricingRule.findMany({
      where: { shop: SHOP_B, productId: PRODUCT_GID },
    });

    expect(result).toHaveLength(0);
  });

  it("CharPriceGroup: ownership check via parent rule prevents cross-shop access", async () => {
    const ruleA = await prisma.pricingRule.create({
      data: { shop: SHOP_A, productId: PRODUCT_GID, fieldId: "field1" },
    });
    const group = await prisma.charPriceGroup.create({
      data: {
        pricingRuleId: ruleA.id,
        label: "Uppercase",
        characters: "ABC",
        pricePerChar: 0.1,
      },
    });

    const found = await prisma.charPriceGroup.findFirst({
      where: { id: group.id, rule: { shop: SHOP_B } },
    });

    expect(found).toBeNull();
  });
});
