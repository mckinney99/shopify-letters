// Pure pricing engine — no side effects, no DB or network calls.
// Matches the per-character logic in the admin live preview exactly:
// for each char, first matching group wins; unmatched chars use perCharPrice.

export type CharGroupRule = {
  label: string;
  characters: string;
  pricePerChar: number; // dollars
};

export type FieldPricingRule = {
  fieldId: string;       // "" = product-level base-price rule
  basePrice: number;     // dollars (used only when fieldId === "")
  perCharPrice: number;  // dollars per unmatched char (per_char mode)
  mode?: "per_char" | "flat" | "percent"; // default per_char
  amount?: number;       // flat $ or percent value (0-100) for flat/percent modes
  charGroups: CharGroupRule[];
};

export type FieldInput = {
  fieldId: string;
  normalizedText: string;
};

export type GroupBreakdown = {
  label: string;
  charCount: number;
  pricePerCharMinor: number;
  subtotalMinor: number;
};

export type FieldBreakdown = {
  fieldId: string;
  charCount: number;
  unmatchedCount: number;
  unmatchedPricePerCharMinor: number;
  unmatchedSubtotalMinor: number;
  groups: GroupBreakdown[];
  subtotalMinor: number;
};

export type PriceBreakdown = {
  baseMinor: number;
  fields: FieldBreakdown[];
};

export type PricingResult = {
  priceMinor: number;
  breakdown: PriceBreakdown;
  validationErrors: string[];
};

// $99,999.99 — guard against runaway configs
const MAX_PRICE_MINOR = 9_999_999;

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

// conditions: used by both preview and transform to skip hidden fields.
export type PricingCondition = {
  fieldId: string;
  triggerFieldId: string;
  operator: string; // "equals" only in v1
  value: string;
};

function isFieldActive(
  fieldId: string,
  fieldInputs: FieldInput[],
  conditions: PricingCondition[]
): boolean {
  const fieldConditions = conditions.filter((c) => c.fieldId === fieldId);
  if (fieldConditions.length === 0) return true;
  // AND semantics: all conditions must be met.
  return fieldConditions.every((cond) => {
    const trigger = fieldInputs.find((f) => f.fieldId === cond.triggerFieldId);
    return cond.operator === "equals"
      ? (trigger?.normalizedText ?? "").trim() === cond.value
      : true;
  });
}

// productBaseMinor: variant price in cents, used only for percent mode.
export function calculateProductPrice(
  fieldInputs: FieldInput[],
  rules: FieldPricingRule[],
  productBaseMinor = 0,
  conditions: PricingCondition[] = []
): PricingResult {
  const validationErrors: string[] = [];
  const baseRule = rules.find((r) => r.fieldId === "");
  const baseMinor = toCents(baseRule?.basePrice ?? 0);

  const fieldBreakdowns: FieldBreakdown[] = [];

  for (const input of fieldInputs) {
    if (!isFieldActive(input.fieldId, fieldInputs, conditions)) continue;

    const rule = rules.find((r) => r.fieldId === input.fieldId);
    if (!rule) continue;

    const mode = rule.mode ?? "per_char";
    const chars = [...input.normalizedText]; // codepoint array — correct for emoji
    const hasValue = chars.length > 0;

    let subtotalMinor: number;
    let groups: GroupBreakdown[] = [];
    let unmatchedCount = 0;
    let unmatchedPricePerCharMinor = 0;
    let unmatchedSubtotalMinor = 0;

    if (mode === "flat") {
      subtotalMinor = hasValue ? toCents(rule.amount ?? 0) : 0;
    } else if (mode === "percent") {
      subtotalMinor = hasValue ? Math.round((rule.amount ?? 0) / 100 * productBaseMinor) : 0;
    } else {
      // per_char (default)
      const groupCounts: Record<string, number> = {};
      for (const g of rule.charGroups) groupCounts[g.label] = 0;

      for (const char of chars) {
        const match = rule.charGroups.find((g) => g.characters.includes(char));
        if (match) {
          groupCounts[match.label]++;
        } else {
          unmatchedCount++;
        }
      }

      groups = rule.charGroups.map((g) => {
        const count = groupCounts[g.label];
        const pricePerCharMinor = toCents(g.pricePerChar);
        return {
          label: g.label,
          charCount: count,
          pricePerCharMinor,
          subtotalMinor: count * pricePerCharMinor,
        };
      });

      unmatchedPricePerCharMinor = toCents(rule.perCharPrice);
      unmatchedSubtotalMinor = unmatchedCount * unmatchedPricePerCharMinor;
      subtotalMinor = groups.reduce((s, g) => s + g.subtotalMinor, 0) + unmatchedSubtotalMinor;
    }

    fieldBreakdowns.push({
      fieldId: input.fieldId,
      charCount: chars.length,
      unmatchedCount,
      unmatchedPricePerCharMinor,
      unmatchedSubtotalMinor,
      groups,
      subtotalMinor,
    });
  }

  const fieldsTotal = fieldBreakdowns.reduce((s, f) => s + f.subtotalMinor, 0);
  let priceMinor = baseMinor + fieldsTotal;

  if (priceMinor < 0) priceMinor = 0;

  if (priceMinor > MAX_PRICE_MINOR) {
    validationErrors.push(
      `Calculated price exceeds the maximum allowed ($${(MAX_PRICE_MINOR / 100).toFixed(2)}).`
    );
    priceMinor = MAX_PRICE_MINOR;
  }

  return {
    priceMinor,
    breakdown: { baseMinor, fields: fieldBreakdowns },
    validationErrors,
  };
}
