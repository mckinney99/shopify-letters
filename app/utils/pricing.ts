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
  perCharPrice: number;  // dollars per unmatched char
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

export function calculateProductPrice(
  fieldInputs: FieldInput[],
  rules: FieldPricingRule[]
): PricingResult {
  const validationErrors: string[] = [];
  const baseRule = rules.find((r) => r.fieldId === "");
  const baseMinor = toCents(baseRule?.basePrice ?? 0);

  const fieldBreakdowns: FieldBreakdown[] = [];

  for (const input of fieldInputs) {
    const rule = rules.find((r) => r.fieldId === input.fieldId);
    if (!rule) continue;

    const chars = [...input.normalizedText]; // codepoint array — correct for emoji
    const groupCounts: Record<string, number> = {};
    for (const g of rule.charGroups) groupCounts[g.label] = 0;

    let unmatchedCount = 0;
    for (const char of chars) {
      const match = rule.charGroups.find((g) => g.characters.includes(char));
      if (match) {
        groupCounts[match.label]++;
      } else {
        unmatchedCount++;
      }
    }

    const groups: GroupBreakdown[] = rule.charGroups.map((g) => {
      const count = groupCounts[g.label];
      const pricePerCharMinor = toCents(g.pricePerChar);
      return {
        label: g.label,
        charCount: count,
        pricePerCharMinor,
        subtotalMinor: count * pricePerCharMinor,
      };
    });

    const unmatchedPricePerCharMinor = toCents(rule.perCharPrice);
    const unmatchedSubtotalMinor = unmatchedCount * unmatchedPricePerCharMinor;
    const groupsSubtotal = groups.reduce((s, g) => s + g.subtotalMinor, 0);
    const subtotalMinor = groupsSubtotal + unmatchedSubtotalMinor;

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
