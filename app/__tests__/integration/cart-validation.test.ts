import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { normalizeInput } from "~/utils/normalize";
import type { FieldRules } from "~/utils/normalize";

// Confirms that the Cart Validation function would reject the same inputs
// the admin's field rules describe. Two complementary test strategies:
//
// 1. In-memory parity tests: verify normalizeInput (admin-side validation)
//    and functionValidateField (ported into the function) agree on the same
//    inputs. No DB needed — immune to parallel test-file interference.
//
// 2. Metafield roundtrip test: verify that the JSON payload syncPricingMetafield
//    writes carries the field rules through to the function unchanged.

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:postgres@localhost:5432/shopify_letters?schema=test",
    },
  },
});

const SHOP = "cart-validation-test.myshopify.com";
const PRODUCT_GID = "gid://shopify/Product/998";

beforeEach(async () => {
  await prisma.pricingRule.deleteMany({ where: { shop: SHOP } }); // cascades charGroups
  await prisma.customizationField.deleteMany({ where: { shop: SHOP } });
  await prisma.productConfig.deleteMany({ where: { shop: SHOP } });
});

// Mirrors validateField (extensions/etch-cart-validation/src/cart_validations_generate_run.ts).
function functionValidateField(
  rawInput: string,
  field: { minChars?: number | null; maxChars?: number | null; allowedChars?: string | null; disallowedChars?: string | null }
): string[] {
  const normalized = rawInput.trim().replace(/\s+/g, " ");
  const chars = [...normalized];
  const errors: string[] = [];

  if (field.allowedChars) {
    const allowed = new Set([...field.allowedChars]);
    const bad = [...new Set(chars.filter((c) => c !== " " && !allowed.has(c)))];
    if (bad.length > 0) errors.push(`${bad.join(", ")} character${bad.length === 1 ? "" : "s"} not allowed`);
  } else if (field.disallowedChars) {
    const disallowed = new Set([...field.disallowedChars]);
    const bad = [...new Set(chars.filter((c) => disallowed.has(c)))];
    if (bad.length > 0) errors.push(`${bad.join(", ")} character${bad.length === 1 ? "" : "s"} not allowed`);
  }

  if (field.minChars != null && chars.length < field.minChars) {
    errors.push(`Must be at least ${field.minChars} character${field.minChars === 1 ? "" : "s"}.`);
  }
  if (field.maxChars != null && chars.length > field.maxChars) {
    errors.push(`Must be at most ${field.maxChars} character${field.maxChars === 1 ? "" : "s"}.`);
  }

  return errors;
}

// ── In-memory parity tests ────────────────────────────────────────────────────

describe("Cart Validation rule parity (in-memory)", () => {
  it("min/max length: function matches normalizeInput", () => {
    const rules: FieldRules = { minChars: 3, maxChars: 10 };

    expect(functionValidateField("Hi", rules)).toEqual(normalizeInput("Hi", rules).errors);
    expect(functionValidateField("Hi", rules)).toEqual(["Must be at least 3 characters."]);

    expect(functionValidateField("This is way too long", rules)).toEqual(normalizeInput("This is way too long", rules).errors);
    expect(functionValidateField("This is way too long", rules)).toEqual(["Must be at most 10 characters."]);

    expect(functionValidateField("Hello", rules)).toEqual(normalizeInput("Hello", rules).errors);
    expect(functionValidateField("Hello", rules)).toEqual([]);
  });

  it("allowedChars: function matches normalizeInput", () => {
    const rules: FieldRules = { allowedChars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" };

    expect(functionValidateField("Hello123", rules)).toEqual(normalizeInput("Hello123", rules).errors);
    expect(functionValidateField("Hello123", rules)).toEqual(["e, l, o characters not allowed"]);
  });

  it("disallowedChars: function matches normalizeInput", () => {
    const rules: FieldRules = { disallowedChars: "!@#$%" };

    expect(functionValidateField("Hello!", rules)).toEqual(normalizeInput("Hello!", rules).errors);
    expect(functionValidateField("Hello!", rules)).toEqual(["! character not allowed"]);
  });

  it("normalizes whitespace before validating, like normalizeInput", () => {
    const rules: FieldRules = { minChars: 5 };
    const raw = "  Hi   there  ";

    expect(functionValidateField(raw, rules)).toEqual(normalizeInput(raw, rules).errors);
    expect(functionValidateField(raw, rules)).toEqual([]);
  });
});

// ── Metafield roundtrip test ──────────────────────────────────────────────────
// Verifies that the field rules payload syncPricingMetafield writes carries
// minChars/maxChars/allowedChars/disallowedChars through to the function.

describe("Cart Validation metafield roundtrip", () => {
  it("field rules survive the pricing_rules metafield payload roundtrip", async () => {
    await prisma.productConfig.create({
      data: { shop: SHOP, productId: PRODUCT_GID, enabled: true, published: true },
    });
    const field = await prisma.customizationField.create({
      data: {
        shop: SHOP,
        productId: PRODUCT_GID,
        label: "Engraving",
        type: "text",
        position: 0,
        minChars: 2,
        maxChars: 8,
        disallowedChars: "!@#$%",
      },
    });

    // Mirrors what syncPricingMetafield serializes
    const fields = await prisma.customizationField.findMany({
      where: { shop: SHOP, productId: PRODUCT_GID },
      orderBy: { position: "asc" },
    });
    const payload = {
      fields: fields.map((f) => ({
        id: f.id,
        label: f.label,
        minChars: f.minChars,
        maxChars: f.maxChars,
        allowedChars: f.allowedChars,
        disallowedChars: f.disallowedChars,
      })),
    };

    const fieldDef = payload.fields.find((f) => f.id === field.id)!;

    // Too short and contains a disallowed character
    expect(functionValidateField("!", fieldDef)).toEqual(normalizeInput("!", fieldDef).errors);
    expect(functionValidateField("!", fieldDef)).toEqual([
      "! character not allowed",
      "Must be at least 2 characters.",
    ]);

    // Within range, no disallowed characters
    expect(functionValidateField("Alice", fieldDef)).toEqual(normalizeInput("Alice", fieldDef).errors);
    expect(functionValidateField("Alice", fieldDef)).toEqual([]);
  });
});
