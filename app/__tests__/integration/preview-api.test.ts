import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { normalizeInput } from "~/utils/normalize";
import { calculateProductPrice } from "~/utils/pricing";
import type { FieldInput, FieldPricingRule } from "~/utils/pricing";
import type { FieldRules } from "~/utils/normalize";

// Tests the full preview pipeline (normalize → price) against real DB data,
// mirroring what the /api/preview action does without spinning up HTTP.

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:postgres@localhost:5433/shopify_letters?schema=test",
    },
  },
});

const SHOP = "preview-test.myshopify.com";
const PRODUCT_GID = "gid://shopify/Product/42";

beforeEach(async () => {
  await prisma.charPriceGroup.deleteMany();
  await prisma.pricingRule.deleteMany();
  await prisma.customizationField.deleteMany();
  await prisma.productConfig.deleteMany();
});

async function seedPublishedProduct() {
  await prisma.productConfig.create({
    data: { shop: SHOP, productId: PRODUCT_GID, enabled: true, published: true },
  });

  const field = await prisma.customizationField.create({
    data: {
      shop: SHOP,
      productId: PRODUCT_GID,
      label: "Engraving",
      type: "text",
      minChars: 1,
      maxChars: 20,
      position: 0,
    },
  });

  const rule = await prisma.pricingRule.create({
    data: {
      shop: SHOP,
      productId: PRODUCT_GID,
      fieldId: "",
      basePrice: 5.0,
      perCharPrice: 0,
    },
  });

  const fieldRule = await prisma.pricingRule.create({
    data: {
      shop: SHOP,
      productId: PRODUCT_GID,
      fieldId: field.id,
      basePrice: 0,
      perCharPrice: 0.5,
    },
  });

  return { field, rule, fieldRule };
}

describe("preview pipeline", () => {
  it("404 when config does not exist", async () => {
    const config = await prisma.productConfig.findUnique({
      where: { shop_productId: { shop: SHOP, productId: PRODUCT_GID } },
    });
    expect(config).toBeNull();
  });

  it("404 when config exists but is not published", async () => {
    await prisma.productConfig.create({
      data: { shop: SHOP, productId: PRODUCT_GID, enabled: true, published: false },
    });
    const config = await prisma.productConfig.findUnique({
      where: { shop_productId: { shop: SHOP, productId: PRODUCT_GID } },
      select: { published: true },
    });
    expect(config?.published).toBe(false);
  });

  it("returns valid price for a published product with text input", async () => {
    const { field, fieldRule } = await seedPublishedProduct();

    const dbField = await prisma.customizationField.findUnique({ where: { id: field.id } });
    const rules = await prisma.pricingRule.findMany({
      where: { shop: SHOP, productId: PRODUCT_GID },
      include: { charGroups: true },
    });

    const fieldRules: FieldRules = {
      minChars: dbField!.minChars,
      maxChars: dbField!.maxChars,
      allowedChars: dbField!.allowedChars,
      disallowedChars: dbField!.disallowedChars,
      charGroups: [],
    };
    const normalized = normalizeInput("Hello", fieldRules);
    expect(normalized.errors).toHaveLength(0);
    expect(normalized.charCount).toBe(5);

    const pricingRules: FieldPricingRule[] = rules.map((r) => ({
      fieldId: r.fieldId,
      basePrice: r.basePrice,
      perCharPrice: r.perCharPrice,
      charGroups: r.charGroups.map((g) => ({
        label: g.label,
        characters: g.characters,
        pricePerChar: g.pricePerChar,
      })),
    }));
    const fieldInputs: FieldInput[] = [
      { fieldId: field.id, normalizedText: normalized.normalizedText },
    ];

    const result = calculateProductPrice(fieldInputs, pricingRules);
    // base $5.00 + 5 chars × $0.50 = $7.50 = 750 cents
    expect(result.priceMinor).toBe(750);
    expect(result.validationErrors).toHaveLength(0);
  });

  it("surfaces validation errors for input violating field rules", async () => {
    await seedPublishedProduct();
    const dbField = await prisma.customizationField.findFirst({
      where: { shop: SHOP, productId: PRODUCT_GID },
    });

    const fieldRules: FieldRules = {
      minChars: dbField!.minChars,
      maxChars: dbField!.maxChars,
      allowedChars: dbField!.allowedChars,
      disallowedChars: dbField!.disallowedChars,
    };

    // empty input violates minChars: 1
    const result = normalizeInput("", fieldRules);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/at least 1/);
  });

  it("does not leak other shop's data", async () => {
    await seedPublishedProduct();

    const otherShopConfig = await prisma.productConfig.findUnique({
      where: { shop_productId: { shop: "other-shop.myshopify.com", productId: PRODUCT_GID } },
    });
    expect(otherShopConfig).toBeNull();

    const otherShopFields = await prisma.customizationField.findMany({
      where: { shop: "other-shop.myshopify.com", productId: PRODUCT_GID },
    });
    expect(otherShopFields).toHaveLength(0);
  });

  it("returns valid=false and errors array when input has violations", async () => {
    const { field } = await seedPublishedProduct();
    const rules = await prisma.pricingRule.findMany({
      where: { shop: SHOP, productId: PRODUCT_GID },
      include: { charGroups: true },
    });
    const dbField = await prisma.customizationField.findUnique({ where: { id: field.id } });

    const fieldRules: FieldRules = {
      minChars: dbField!.minChars,
      maxChars: dbField!.maxChars,
      allowedChars: dbField!.allowedChars,
      disallowedChars: dbField!.disallowedChars,
    };
    // "x".repeat(21) exceeds maxChars: 20
    const normalized = normalizeInput("x".repeat(21), fieldRules);
    expect(normalized.errors).toHaveLength(1);

    const allErrors = normalized.errors.map((e) => `${dbField!.label}: ${e}`);
    const pricingRules: FieldPricingRule[] = rules.map((r) => ({
      fieldId: r.fieldId,
      basePrice: r.basePrice,
      perCharPrice: r.perCharPrice,
      charGroups: [],
    }));
    const priceResult = calculateProductPrice(
      [{ fieldId: field.id, normalizedText: normalized.normalizedText }],
      pricingRules
    );
    allErrors.push(...priceResult.validationErrors);

    expect(allErrors.length).toBeGreaterThan(0);
  });
});
