import { describe, it, expect } from "vitest";
import { parseLineItemCustomization, formatMinor } from "~/utils/orderCustomization";

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
    expect(result?.calculatedAt).toBe("2026-06-01T00:00:00.000Z");
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
});

describe("formatMinor", () => {
  it("formats cents as a dollar string", () => {
    expect(formatMinor(0)).toBe("$0.00");
    expect(formatMinor(150)).toBe("$1.50");
    expect(formatMinor(99999)).toBe("$999.99");
  });
});
