import { describe, it, expect } from "vitest";
import { parseLineItemCustomization, formatMinor, dollarsToMinor } from "~/utils/orderCustomization";

describe("parseLineItemCustomization", () => {
  it("returns null for line items without etch customization", () => {
    expect(parseLineItemCustomization([{ key: "Gift note", value: "Happy birthday" }])).toBeNull();
    expect(parseLineItemCustomization([])).toBeNull();
  });

  it("extracts customer-facing field values, excluding underscore-prefixed metadata", () => {
    const result = parseLineItemCustomization([
      { key: "Engraving Text", value: "Happy Birthday" },
      { key: "_etch_inputs", value: '{"f1":"Happy Birthday"}' },
      { key: "_etch_price_minor", value: "350" },
      { key: "_etch_price", value: "$3.50" },
      { key: "_etch_calculated_at", value: "2026-06-01T00:00:00.000Z" },
    ]);

    expect(result).not.toBeNull();
    expect(result?.fieldValues).toEqual([{ label: "Engraving Text", value: "Happy Birthday" }]);
    expect(result?.priceFormatted).toBe("$3.50");
    expect(result?.previewPriceMinor).toBe(350);
    expect(result?.calculatedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("returns null previewPriceMinor when _etch_price_minor is absent", () => {
    const result = parseLineItemCustomization([
      { key: "_etch_inputs", value: '{"f1":"Hi"}' },
      { key: "_etch_price", value: "$2.00" },
    ]);

    expect(result?.previewPriceMinor).toBeNull();
  });

  it("extracts the correlation ID from _etch_correlation_id", () => {
    const result = parseLineItemCustomization([
      { key: "_etch_inputs", value: '{"f1":"Hi"}' },
      { key: "_etch_correlation_id", value: "corr-123" },
    ]);

    expect(result?.correlationId).toBe("corr-123");
  });

  it("returns null correlationId when _etch_correlation_id is absent", () => {
    const result = parseLineItemCustomization([
      { key: "_etch_inputs", value: '{"f1":"Hi"}' },
    ]);

    expect(result?.correlationId).toBeNull();
  });

  it("parses the pricing breakdown when present", () => {
    const breakdown = {
      baseMinor: 200,
      fields: [
        {
          fieldLabel: "Engraving Text",
          unmatchedCount: 3,
          unmatchedPricePerCharMinor: 50,
          unmatchedSubtotalMinor: 150,
          groups: [{ label: "Emoji", charCount: 1, pricePerCharMinor: 100, subtotalMinor: 100 }],
          subtotalMinor: 250,
        },
      ],
    };

    const result = parseLineItemCustomization([
      { key: "Engraving Text", value: "abc😀" },
      { key: "_etch_inputs", value: '{"f1":"abc😀"}' },
      { key: "_etch_breakdown", value: JSON.stringify(breakdown) },
    ]);

    expect(result?.breakdown).toEqual(breakdown);
  });

  it("returns null breakdown for orders placed before this feature shipped", () => {
    const result = parseLineItemCustomization([
      { key: "Engraving Text", value: "Happy Birthday" },
      { key: "_etch_inputs", value: '{"f1":"Happy Birthday"}' },
      { key: "_etch_price", value: "$2.00" },
    ]);

    expect(result?.breakdown).toBeNull();
  });

  it("returns null breakdown when _etch_breakdown is invalid JSON", () => {
    const result = parseLineItemCustomization([
      { key: "_etch_inputs", value: "{}" },
      { key: "_etch_breakdown", value: "not json" },
    ]);

    expect(result?.breakdown).toBeNull();
  });

  it("extracts the config snapshot ID from _etch_rule_version", () => {
    const result = parseLineItemCustomization([
      { key: "_etch_inputs", value: '{"f1":"Hi"}' },
      { key: "_etch_rule_version", value: "a1b2c3d4e5f6" },
    ]);

    expect(result?.ruleVersion).toBe("a1b2c3d4e5f6");
  });

  it("returns null ruleVersion for orders placed before this feature shipped", () => {
    const result = parseLineItemCustomization([
      { key: "_etch_inputs", value: '{"f1":"Hi"}' },
      { key: "_etch_price", value: "$2.00" },
    ]);

    expect(result?.ruleVersion).toBeNull();
  });
});

// FR25: a support agent looking at an order's line item properties — exactly
// as delivered via the Admin API / order webhooks, with no further lookups —
// must be able to answer "why was this priced this way?"
describe("simulated support scenario (FR25)", () => {
  it("reconstructs a full price explanation from line item properties alone", () => {
    const breakdown = {
      baseMinor: 900,
      fields: [
        {
          fieldLabel: "Custom message",
          unmatchedCount: 12,
          unmatchedPricePerCharMinor: 50,
          unmatchedSubtotalMinor: 600,
          groups: [{ label: "Emoji", charCount: 2, pricePerCharMinor: 100, subtotalMinor: 200 }],
          subtotalMinor: 800,
        },
      ],
    };

    // Shape mirrors lineItemGroup.customAttributes / note_attributes as
    // surfaced by the Admin API and orders/* webhooks.
    const properties = [
      { key: "Custom message", value: "Happy Birthday 😀😎" },
      { key: "_etch_inputs", value: '{"f1":"Happy Birthday 😀😎"}' },
      { key: "_etch_price_minor", value: "1700" },
      { key: "_etch_price", value: "$17.00" },
      { key: "_etch_calculated_at", value: "2026-06-10T00:00:00.000Z" },
      { key: "_etch_breakdown", value: JSON.stringify(breakdown) },
      { key: "_etch_rule_version", value: "a1b2c3d4e5f6" },
    ];

    const result = parseLineItemCustomization(properties);

    expect(result).not.toBeNull();
    // Field values the customer entered
    expect(result?.fieldValues).toEqual([{ label: "Custom message", value: "Happy Birthday 😀😎" }]);
    // Enforced price
    expect(result?.priceFormatted).toBe("$17.00");
    expect(result?.previewPriceMinor).toBe(1700);
    // Breakdown, including per-group character counts
    expect(result?.breakdown?.baseMinor).toBe(900);
    expect(result?.breakdown?.fields[0].groups[0]).toEqual({
      label: "Emoji",
      charCount: 2,
      pricePerCharMinor: 100,
      subtotalMinor: 200,
    });
    expect(result?.breakdown?.fields[0].unmatchedCount).toBe(12);
    // Rule version / config snapshot ID used to calculate the price
    expect(result?.ruleVersion).toBe("a1b2c3d4e5f6");
    // When the price was calculated
    expect(result?.calculatedAt).toBe("2026-06-10T00:00:00.000Z");
  });
});

describe("formatMinor", () => {
  it("formats cents as a dollar string", () => {
    expect(formatMinor(0)).toBe("$0.00");
    expect(formatMinor(150)).toBe("$1.50");
    expect(formatMinor(99999)).toBe("$999.99");
  });
});

describe("dollarsToMinor", () => {
  it("converts a decimal amount string to integer minor units", () => {
    expect(dollarsToMinor("17.00")).toBe(1700);
    expect(dollarsToMinor("3.50")).toBe(350);
    expect(dollarsToMinor("0.00")).toBe(0);
  });

  it("rounds to the nearest cent", () => {
    expect(dollarsToMinor("2.999")).toBe(300);
  });
});
