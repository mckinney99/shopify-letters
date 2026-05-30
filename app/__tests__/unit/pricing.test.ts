import { describe, it, expect } from "vitest";
import { calculateProductPrice } from "~/utils/pricing";
import type { FieldInput, FieldPricingRule } from "~/utils/pricing";

const BASE_RULE: FieldPricingRule = {
  fieldId: "",
  basePrice: 2.0,
  perCharPrice: 0,
  charGroups: [],
};

const FIELD_RULE: FieldPricingRule = {
  fieldId: "f1",
  basePrice: 0,
  perCharPrice: 0.5,
  charGroups: [],
};

// ── Zero characters ────────────────────────────────────────────────────────

describe("zero characters", () => {
  it("returns base price only when input is empty", () => {
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "" }],
      [BASE_RULE, FIELD_RULE]
    );
    expect(result.priceMinor).toBe(200);
    expect(result.validationErrors).toHaveLength(0);
  });

  it("returns 0 with no inputs and no base price", () => {
    const result = calculateProductPrice([], []);
    expect(result.priceMinor).toBe(0);
  });

  it("breakdown baseMinor equals base price in cents", () => {
    const result = calculateProductPrice([], [BASE_RULE]);
    expect(result.breakdown.baseMinor).toBe(200);
    expect(result.breakdown.fields).toHaveLength(0);
  });
});

// ── Per-character pricing (no groups) ─────────────────────────────────────

describe("per-character pricing", () => {
  it("charges perCharPrice for each character", () => {
    // 3 chars × $0.50 + $2.00 base = $3.50 = 350 cents
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "abc" }],
      [BASE_RULE, FIELD_RULE]
    );
    expect(result.priceMinor).toBe(350);
  });

  it("counts codepoints correctly for emoji", () => {
    // emoji = 1 codepoint × $0.50 + $2.00 base = $2.50 = 250 cents
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "😀" }],
      [BASE_RULE, FIELD_RULE]
    );
    expect(result.priceMinor).toBe(250);
  });

  it("fills breakdown field entry", () => {
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "hi" }],
      [BASE_RULE, FIELD_RULE]
    );
    expect(result.breakdown.fields[0].charCount).toBe(2);
    expect(result.breakdown.fields[0].unmatchedCount).toBe(2);
    expect(result.breakdown.fields[0].subtotalMinor).toBe(100);
  });
});

// ── Group-based pricing ────────────────────────────────────────────────────

describe("group-based pricing", () => {
  const UPPERCASE_RULE: FieldPricingRule = {
    fieldId: "f1",
    basePrice: 0,
    perCharPrice: 0.10,
    charGroups: [
      { label: "Uppercase", characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", pricePerChar: 0.25 },
    ],
  };

  it("charges group rate for matched chars, per-char rate for unmatched", () => {
    // "Aa": A → group 0.25, a → unmatched 0.10 → 35 cents, no base
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "Aa" }],
      [UPPERCASE_RULE]
    );
    expect(result.priceMinor).toBe(35);
  });

  it("correctly fills group breakdown", () => {
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "ABC" }],
      [UPPERCASE_RULE]
    );
    const group = result.breakdown.fields[0].groups[0];
    expect(group.charCount).toBe(3);
    expect(group.pricePerCharMinor).toBe(25);
    expect(group.subtotalMinor).toBe(75);
    expect(result.breakdown.fields[0].unmatchedCount).toBe(0);
  });
});

// ── Multi-group ────────────────────────────────────────────────────────────

describe("multi-group pricing", () => {
  const MULTI_RULE: FieldPricingRule = {
    fieldId: "f1",
    basePrice: 0,
    perCharPrice: 0.05,
    charGroups: [
      { label: "Uppercase", characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", pricePerChar: 0.30 },
      { label: "Digits", characters: "0123456789", pricePerChar: 0.20 },
    ],
  };

  it("prices each char via its correct group", () => {
    // "A1x": A→0.30, 1→0.20, x→0.05 → 55 cents
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "A1x" }],
      [MULTI_RULE]
    );
    expect(result.priceMinor).toBe(55);
  });

  it("reports correct counts per group", () => {
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "AB12" }],
      [MULTI_RULE]
    );
    const [upper, digits] = result.breakdown.fields[0].groups;
    expect(upper.charCount).toBe(2);
    expect(digits.charCount).toBe(2);
    expect(result.breakdown.fields[0].unmatchedCount).toBe(0);
  });
});

// ── Overlapping / conflicting groups (first match wins) ───────────────────

describe("conflicting group rules", () => {
  it("first matching group wins when groups overlap", () => {
    const OVERLAP_RULE: FieldPricingRule = {
      fieldId: "f1",
      basePrice: 0,
      perCharPrice: 0.01,
      charGroups: [
        { label: "First", characters: "A", pricePerChar: 1.00 },
        { label: "Second", characters: "A", pricePerChar: 0.50 }, // A also in second
      ],
    };
    // A should be priced at 1.00 (first group), not 0.50
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "A" }],
      [OVERLAP_RULE]
    );
    expect(result.priceMinor).toBe(100);
    expect(result.breakdown.fields[0].groups[0].charCount).toBe(1);
    expect(result.breakdown.fields[0].groups[1].charCount).toBe(0);
  });
});

// ── Multiple fields ────────────────────────────────────────────────────────

describe("multiple fields", () => {
  it("sums pricing across all fields plus base", () => {
    const rules: FieldPricingRule[] = [
      { fieldId: "", basePrice: 1.00, perCharPrice: 0, charGroups: [] },
      { fieldId: "f1", basePrice: 0, perCharPrice: 0.10, charGroups: [] },
      { fieldId: "f2", basePrice: 0, perCharPrice: 0.20, charGroups: [] },
    ];
    // base $1.00 + f1 "hi" 2×0.10 + f2 "bye" 3×0.20 = 100 + 20 + 60 = 180 cents
    const result = calculateProductPrice(
      [
        { fieldId: "f1", normalizedText: "hi" },
        { fieldId: "f2", normalizedText: "bye" },
      ],
      rules
    );
    expect(result.priceMinor).toBe(180);
  });

  it("skips fields with no matching rule", () => {
    const result = calculateProductPrice(
      [{ fieldId: "unknown", normalizedText: "hello" }],
      [BASE_RULE]
    );
    expect(result.priceMinor).toBe(200); // base only
  });
});

// ── Price overflow guard ───────────────────────────────────────────────────

describe("price overflow guard", () => {
  it("caps price at MAX and returns a validation error", () => {
    const HUGE_RULE: FieldPricingRule = {
      fieldId: "f1",
      basePrice: 0,
      perCharPrice: 100_000, // $100k per char
      charGroups: [],
    };
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "abc" }],
      [HUGE_RULE]
    );
    expect(result.priceMinor).toBe(9_999_999);
    expect(result.validationErrors).toHaveLength(1);
    expect(result.validationErrors[0]).toMatch(/maximum/);
  });

  it("does not error for price exactly at the cap", () => {
    // $99,999.99 = 9_999_999 cents
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "a" }],
      [{ fieldId: "f1", basePrice: 0, perCharPrice: 99_999.99, charGroups: [] }]
    );
    expect(result.priceMinor).toBe(9_999_999);
    expect(result.validationErrors).toHaveLength(0);
  });
});

// ── Minor-unit rounding ────────────────────────────────────────────────────

describe("minor unit rounding", () => {
  it("rounds per-char prices to nearest cent before summing", () => {
    // $0.005 per char → Math.round(0.5) = 1 cent per char
    // 3 chars → 3 cents
    const result = calculateProductPrice(
      [{ fieldId: "f1", normalizedText: "abc" }],
      [{ fieldId: "f1", basePrice: 0, perCharPrice: 0.005, charGroups: [] }]
    );
    expect(result.priceMinor).toBe(3);
  });
});
