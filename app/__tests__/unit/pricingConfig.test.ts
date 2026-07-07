import { describe, it, expect } from "vitest";
import { buildPricingConfig, computeConfigVersion } from "~/utils/pricingConfig";

const baseFields = [
  {
    id: "field-1",
    label: "Engraving",
    type: "text",
    required: false,
    minChars: 1,
    maxChars: 20,
    allowedChars: null,
    disallowedChars: null,
    options: [],
  },
];

const baseRules = [
  {
    fieldId: "field-1",
    perCharPrice: 0.5,
    charGroups: [{ label: "Emoji", characters: "😀😎", pricePerChar: 1 }],
  },
];

// Simulates what Prisma returns — includes basePrice DB column and a legacy
// fieldId:"" base-price row. buildPricingConfig must strip both from output.
const dbRules = [
  {
    fieldId: "",
    basePrice: 5,
    perCharPrice: 0,
    charGroups: [],
  },
  {
    fieldId: "field-1",
    basePrice: 0,
    perCharPrice: 0.5,
    charGroups: [{ label: "Emoji", characters: "😀😎", pricePerChar: 1 }],
  },
];

describe("buildPricingConfig", () => {
  it("keeps only the fields relevant to pricing, dropping DB-only columns", () => {
    const config = buildPricingConfig(
      [{ ...baseFields[0], shop: "x", productId: "y", type: "text", position: 0 } as any],
      dbRules.map((r) => ({ ...r, id: "rule-1", shop: "x", productId: "y" } as any))
    );

    expect(config.fields).toEqual(baseFields);
    expect(config.rules).toEqual(baseRules);
  });

  it("filters out the legacy fieldId:'' base-price rule", () => {
    const config = buildPricingConfig(
      baseFields,
      dbRules.map((r) => ({ ...r, id: "rule-1", shop: "x", productId: "y" } as any))
    );
    expect(config.rules.every((r) => r.fieldId !== "")).toBe(true);
  });
});

describe("computeConfigVersion", () => {
  it("is deterministic for the same config", () => {
    const config = buildPricingConfig(baseFields, baseRules);
    expect(computeConfigVersion(config)).toBe(computeConfigVersion(config));
  });

  it("returns a short hex string", () => {
    const version = computeConfigVersion(buildPricingConfig(baseFields, baseRules));
    expect(version).toMatch(/^[0-9a-f]{12}$/);
  });

  it("changes when a pricing rule changes", () => {
    const before = computeConfigVersion(buildPricingConfig(baseFields, dbRules));

    const changedRules = dbRules.map((r) =>
      r.fieldId === "field-1" ? { ...r, perCharPrice: 0.75 } : r
    );
    const after = computeConfigVersion(buildPricingConfig(baseFields, changedRules));

    expect(after).not.toBe(before);
  });

  it("changes when a field definition changes", () => {
    const before = computeConfigVersion(buildPricingConfig(baseFields, baseRules));

    const changedFields = [{ ...baseFields[0], maxChars: 30 }];
    const after = computeConfigVersion(buildPricingConfig(changedFields, baseRules));

    expect(after).not.toBe(before);
  });

  it("is unaffected by unrelated DB columns", () => {
    const withExtras = buildPricingConfig(
      [{ ...baseFields[0], shop: "shop-a", productId: "p1", type: "text", position: 0 } as any],
      dbRules.map((r) => ({ ...r, id: "rule-1", shop: "shop-a", productId: "p1" } as any))
    );
    const withoutExtras = buildPricingConfig(baseFields, dbRules);

    expect(computeConfigVersion(withExtras)).toBe(computeConfigVersion(withoutExtras));
  });
});
