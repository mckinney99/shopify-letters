import { describe, it, expect } from "vitest";
import { calculateProductPrice } from "~/utils/pricing";
import type { FieldPricingRule, PricingCondition } from "~/utils/pricing";

const BASE_PRICE_MINOR = 1000; // $10.00 product base price

// ── Flat fee mode ─────────────────────────────────────────────────────────────

describe("flat fee mode", () => {
  const FLAT_RULE: FieldPricingRule = {
    fieldId: "f1",
    basePrice: 0,
    perCharPrice: 0,
    mode: "flat",
    amount: 5.0,
    charGroups: [],
  };

  it("adds flat amount when field has a value", () => {
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "hello" }],
      [FLAT_RULE],
      BASE_PRICE_MINOR
    );
    expect(result.priceMinor).toBe(500); // $5.00 = 500 cents
  });

  it("adds nothing when field is empty", () => {
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "" }],
      [FLAT_RULE],
      BASE_PRICE_MINOR
    );
    expect(result.priceMinor).toBe(0);
  });

  it("flat amount is fixed regardless of character count", () => {
    const result1 = calculateProductPrice([{ fieldId: "f1", normalizedText: "a" }], [FLAT_RULE], BASE_PRICE_MINOR);
    const result2 = calculateProductPrice([{ fieldId: "f1", normalizedText: "abcdefghij" }], [FLAT_RULE], BASE_PRICE_MINOR);
    expect(result1.priceMinor).toBe(result2.priceMinor);
    expect(result1.priceMinor).toBe(500);
  });
});

// ── Percentage mode ───────────────────────────────────────────────────────────

describe("percentage mode", () => {
  const PERCENT_RULE: FieldPricingRule = {
    fieldId: "f1",
    basePrice: 0,
    perCharPrice: 0,
    mode: "percent",
    amount: 10, // 10%
    charGroups: [],
  };

  it("adds percentage of product base price when field has a value", () => {
    // 10% of $10.00 = $1.00 = 100 cents
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "hello" }],
      [PERCENT_RULE],
      BASE_PRICE_MINOR
    );
    expect(result.priceMinor).toBe(100);
  });

  it("adds nothing when field is empty", () => {
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "" }],
      [PERCENT_RULE],
      BASE_PRICE_MINOR
    );
    expect(result.priceMinor).toBe(0);
  });

  it("percentage scales with base price", () => {
    // 10% of $20.00 = $2.00 = 200 cents
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "hi" }],
      [PERCENT_RULE],
      2000 // $20.00
    );
    expect(result.priceMinor).toBe(200);
  });

  it("returns 0 when productBaseMinor is 0", () => {
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "hello" }],
      [PERCENT_RULE],
      0
    );
    expect(result.priceMinor).toBe(0);
  });
});

// ── Backward compatibility — per_char default ─────────────────────────────────

describe("per_char mode backward compatibility", () => {
  it("defaults to per_char when mode is undefined", () => {
    const rule: FieldPricingRule = { fieldId: "f1", basePrice: 0, perCharPrice: 0.5, charGroups: [] };
    const result = calculateProductPrice([{ fieldId: "f1", normalizedText: "abc" }], [rule], BASE_PRICE_MINOR);
    expect(result.priceMinor).toBe(150); // 3 × $0.50
  });

  it("explicit per_char mode behaves identically to undefined mode", () => {
    const rule: FieldPricingRule = { fieldId: "f1", basePrice: 0, perCharPrice: 0.5, mode: "per_char", charGroups: [] };
    const result = calculateProductPrice([{ fieldId: "f1", normalizedText: "abc" }], [rule], BASE_PRICE_MINOR);
    expect(result.priceMinor).toBe(150);
  });
});

// ── Conditional logic (SL-85) ─────────────────────────────────────────────────

describe("conditional logic", () => {
  const FLAT_RULE: FieldPricingRule = {
    fieldId: "f2",
    basePrice: 0,
    perCharPrice: 0,
    mode: "flat",
    amount: 3.0, // $3 flat
    charGroups: [],
  };
  const TRIGGER_RULE: FieldPricingRule = {
    fieldId: "f1",
    basePrice: 0,
    perCharPrice: 0.1,
    charGroups: [],
  };
  const CONDITION: PricingCondition = {
    fieldId: "f2",
    triggerFieldId: "f1",
    operator: "equals",
    value: "yes",
  };

  it("applies pricing for active (condition met) field", () => {
    const result = calculateProductPrice(
      [
        { fieldId: "f1", normalizedText: "yes" },
        { fieldId: "f2", normalizedText: "engrave me" },
      ],
      [TRIGGER_RULE, FLAT_RULE],
      BASE_PRICE_MINOR,
      [CONDITION]
    );
    // f1: 3 chars × $0.10 = 30 cents; f2 active: $3.00 = 300 cents; total = 330
    expect(result.priceMinor).toBe(330);
  });

  it("skips pricing for hidden (condition not met) field", () => {
    const result = calculateProductPrice(
      [
        { fieldId: "f1", normalizedText: "no" },
        { fieldId: "f2", normalizedText: "engrave me" },
      ],
      [TRIGGER_RULE, FLAT_RULE],
      BASE_PRICE_MINOR,
      [CONDITION]
    );
    // f1: 2 chars × $0.10 = 20 cents; f2 hidden: $0; total = 20
    expect(result.priceMinor).toBe(20);
  });

  it("fields with no condition are always active", () => {
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "abc" }],
      [TRIGGER_RULE],
      BASE_PRICE_MINOR,
      [CONDITION] // condition refers to f2, not f1
    );
    expect(result.priceMinor).toBe(30); // 3 × 10 cents
  });

  it("hidden required-equivalent field (per_char) charges nothing", () => {
    const perCharRule: FieldPricingRule = { fieldId: "f2", basePrice: 0, perCharPrice: 1.0, charGroups: [] };
    const result = calculateProductPrice(
      [
        { fieldId: "f1", normalizedText: "hide" },
        { fieldId: "f2", normalizedText: "would charge a lot" },
      ],
      [TRIGGER_RULE, perCharRule],
      BASE_PRICE_MINOR,
      [CONDITION] // f2 only shows when f1 === "yes"
    );
    // f1 is "hide" ≠ "yes", so f2 is hidden → no charge for f2
    const f1Charge = [...("hide")].length * 10; // 4 × 10 cents
    expect(result.priceMinor).toBe(f1Charge);
  });
});
