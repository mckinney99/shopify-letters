import { describe, it, expect } from "vitest";
import { buildStorefrontFields, buildStorefrontConfig } from "~/utils/storefrontConfig";

const baseField = {
  id: "f1", label: "Engraving", type: "text", required: true,
  minChars: 0, maxChars: 20, allowedChars: null, disallowedChars: null,
  allowSpaces: true, countSpaces: true, helpText: null, dateFutureOnly: false,
  fontOptions: null, textColorOptions: null, fontSizeOptions: null,
  defaultFont: null, defaultTextColor: null, defaultFontSize: null, fileAccept: null,
  previewX: 10, previewY: 20, previewW: 30, previewH: 15, previewRotation: 45,
  options: [] as any[],
};

describe("buildStorefrontFields", () => {
  it("merges the matching pricing rule onto the field", () => {
    const [f] = buildStorefrontFields(
      [baseField],
      [{ fieldId: "f1", perCharPrice: 2, mode: "per_char", amount: 0, charGroups: [{ label: "vowels", pricePerChar: 3 }] }],
    );
    expect(f.perCharPrice).toBe(2);
    expect(f.mode).toBe("per_char");
    expect(f.charGroups).toEqual([{ label: "vowels", pricePerChar: 3 }]);
    // preview placement + options carried through
    expect(f.previewRotation).toBe(45);
  });

  it("defaults pricing when no rule matches the field", () => {
    const [f] = buildStorefrontFields([baseField], []);
    expect(f.perCharPrice).toBeNull();
    expect(f.mode).toBe("per_char");
    expect(f.amount).toBe(0);
    expect(f.charGroups).toEqual([]);
  });

  it("carries the merchant-locked default style through untouched", () => {
    const [f] = buildStorefrontFields(
      [{ ...baseField, defaultFont: "Dancing Script", defaultTextColor: "#d4af37", defaultFontSize: "18px" }],
      [],
    );
    expect(f.defaultFont).toBe("Dancing Script");
    expect(f.defaultTextColor).toBe("#d4af37");
    expect(f.defaultFontSize).toBe("18px");
  });
});

describe("buildStorefrontConfig", () => {
  it("returns fields + trimmed conditions", () => {
    const cfg = buildStorefrontConfig(
      [baseField],
      [],
      [{ fieldId: "f2", triggerFieldId: "f1", operator: "eq", value: "X", extra: "ignored" } as any],
    );
    expect(cfg.fields).toHaveLength(1);
    expect(cfg.conditions).toEqual([{ fieldId: "f2", triggerFieldId: "f1", operator: "eq", value: "X" }]);
  });
});
