import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { normalizeText } from "~/utils/normalize";
import { calculateProductPrice } from "~/utils/pricing";
import type { FieldInput, FieldPricingRule } from "~/utils/pricing";

// Confirms that the Cart Transform function would enforce the same price the
// preview API showed the shopper. Two complementary test strategies:
//
// 1. In-memory parity tests: verify calculateProductPrice (preview API engine)
//    and functionCalculatePrice (ported into the function) agree on the same
//    inputs. No DB needed — immune to parallel test-file interference.
//
// 2. Metafield roundtrip test: verify that the JSON payload syncPricingMetafield
//    writes produces the correct field→label mapping when re-read by the function.

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:postgres@localhost:5432/shopify_letters?schema=test",
    },
  },
});

const SHOP = "cart-transform-test.myshopify.com";
const PRODUCT_GID = "gid://shopify/Product/999";

beforeEach(async () => {
  await prisma.pricingRule.deleteMany({ where: { shop: SHOP } }); // cascades charGroups
  await prisma.customizationField.deleteMany({ where: { shop: SHOP } });
  await prisma.productConfig.deleteMany({ where: { shop: SHOP } });
});

// Mirrors the function's calculatePrice logic (extensions/etch-cart-transform/src/run.ts).
function functionCalculatePrice(
  fieldInputs: Array<{ fieldId: string; normalizedText: string }>,
  rules: Array<{ fieldId: string; basePrice: number; perCharPrice: number; charGroups: Array<{ label: string; characters: string; pricePerChar: number }> }>
): number {
  const MAX_PRICE_MINOR = 9_999_999;
  function toCents(d: number) { return Math.round(d * 100); }

  const baseRule = rules.find((r) => r.fieldId === "");
  let total = toCents(baseRule?.basePrice ?? 0);

  for (const input of fieldInputs) {
    const rule = rules.find((r) => r.fieldId === input.fieldId);
    if (!rule) continue;
    for (const char of [...input.normalizedText]) {
      const group = rule.charGroups.find((g) => g.characters.includes(char));
      total += toCents(group ? group.pricePerChar : rule.perCharPrice);
    }
  }

  if (total < 0) total = 0;
  if (total > MAX_PRICE_MINOR) total = MAX_PRICE_MINOR;
  return total;
}

// ── In-memory parity tests ────────────────────────────────────────────────────
// These tests don't touch the DB, so they're immune to concurrent deleteMany
// calls from other test files running in the integration suite.

describe("Cart Transform price parity (in-memory)", () => {
  it("basic per-char pricing: function matches preview API", () => {
    const fieldId = "field-abc";
    const rules: FieldPricingRule[] = [
      { fieldId: "", basePrice: 5.0, perCharPrice: 0, charGroups: [] },
      { fieldId, basePrice: 0, perCharPrice: 0.5, charGroups: [] },
    ];
    const rawInput = "  Hello  World  "; // normalizes to "Hello World" = 11 chars

    const normalized = normalizeText(rawInput);
    const fieldInputs: FieldInput[] = [{ fieldId, normalizedText: normalized }];

    const previewPrice = calculateProductPrice(fieldInputs, rules).priceMinor;
    const fnPrice = functionCalculatePrice(fieldInputs, rules);

    expect(fnPrice).toBe(previewPrice);
    // $5 base + 11 chars × $0.50 = $10.50 = 1050 cents
    expect(fnPrice).toBe(1050);
  });

  it("char-group pricing (emoji surcharge): function matches preview API", () => {
    const fieldId = "field-xyz";
    const rules: FieldPricingRule[] = [
      { fieldId: "", basePrice: 2.0, perCharPrice: 0, charGroups: [] },
      {
        fieldId,
        basePrice: 0,
        perCharPrice: 0.25,
        charGroups: [{ label: "Emoji", characters: "😀❤️", pricePerChar: 1.0 }],
      },
    ];
    const rawInput = "Hi😀";
    const normalized = normalizeText(rawInput);
    const fieldInputs: FieldInput[] = [{ fieldId, normalizedText: normalized }];

    const previewPrice = calculateProductPrice(fieldInputs, rules).priceMinor;
    const fnPrice = functionCalculatePrice(fieldInputs, rules);

    expect(fnPrice).toBe(previewPrice);
    // $2 base + 'H' $0.25 + 'i' $0.25 + '😀' $1.00 = 200 + 25 + 25 + 100 = 350 cents
    expect(fnPrice).toBe(350);
  });

  it("no field values (bypassed extension): charges only base price", () => {
    const fieldId = "field-qrs";
    const rules: FieldPricingRule[] = [
      { fieldId: "", basePrice: 10.0, perCharPrice: 0, charGroups: [] },
      { fieldId, basePrice: 0, perCharPrice: 0.5, charGroups: [] },
    ];
    const fieldInputs: FieldInput[] = [{ fieldId, normalizedText: "" }];

    const previewPrice = calculateProductPrice(fieldInputs, rules).priceMinor;
    const fnPrice = functionCalculatePrice(fieldInputs, rules);

    expect(fnPrice).toBe(previewPrice);
    // 0 chars → base price only: $10.00 = 1000 cents
    expect(fnPrice).toBe(1000);
  });
});

// ── Metafield roundtrip test ──────────────────────────────────────────────────
// Verifies that the payload syncPricingMetafield writes produces the correct
// field-label → fieldId mapping when the function resolves line attributes.

describe("Cart Transform metafield roundtrip", () => {
  it("label-keyed line attributes map to the correct field IDs via the metafield payload", async () => {
    await prisma.productConfig.create({
      data: { shop: SHOP, productId: PRODUCT_GID, enabled: true, published: true },
    });
    const field = await prisma.customizationField.create({
      data: { shop: SHOP, productId: PRODUCT_GID, label: "Engraving", type: "text", position: 0 },
    });
    await prisma.pricingRule.create({
      data: { shop: SHOP, productId: PRODUCT_GID, fieldId: "", basePrice: 5.0, perCharPrice: 0 },
    });
    await prisma.pricingRule.create({
      data: { shop: SHOP, productId: PRODUCT_GID, fieldId: field.id, perCharPrice: 0.5 },
    });

    // Mirrors what syncPricingMetafield serializes
    const [fields, rules] = await Promise.all([
      prisma.customizationField.findMany({
        where: { shop: SHOP, productId: PRODUCT_GID },
        orderBy: { position: "asc" },
      }),
      prisma.pricingRule.findMany({
        where: { shop: SHOP, productId: PRODUCT_GID },
        include: { charGroups: true },
      }),
    ]);
    const payload = {
      fields: fields.map((f) => ({ id: f.id, label: f.label })),
      rules: rules.map((r) => ({
        fieldId: r.fieldId,
        basePrice: r.basePrice,
        perCharPrice: r.perCharPrice,
        charGroups: r.charGroups.map((g) => ({
          label: g.label,
          characters: g.characters,
          pricePerChar: g.pricePerChar,
        })),
      })),
    };

    // Simulate the function mapping line attributes to field inputs by label
    const lineAttributes = [{ key: "Engraving", value: "Hello" }];
    const fnInputs = payload.fields.map((fd) => {
      const attr = lineAttributes.find((a) => a.key === fd.label);
      return { fieldId: fd.id, normalizedText: normalizeText(attr?.value ?? "") };
    });

    const fnPrice = functionCalculatePrice(fnInputs, payload.rules);
    // $5 base + 5 chars × $0.50 = $7.50 = 750 cents
    expect(fnPrice).toBe(750);
    // Confirm the fieldId resolved from the label matches the seeded field
    expect(fnInputs[0].fieldId).toBe(field.id);
  });
});
