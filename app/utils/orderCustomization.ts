// Reads the customization snapshot that etch-customization.js attaches to
// cart line item properties (see SL-26/SL-29). Everything needed to render
// the admin order view is self-contained in these properties — no DB or
// extra Admin API calls required.

export type LineItemAttribute = { key: string; value: string | null };

export type BreakdownGroup = {
  label: string;
  charCount: number;
  pricePerCharMinor: number;
  subtotalMinor: number;
};

export type BreakdownField = {
  fieldLabel: string;
  unmatchedCount: number;
  unmatchedPricePerCharMinor: number;
  unmatchedSubtotalMinor: number;
  groups: BreakdownGroup[];
  subtotalMinor: number;
};

export type LineItemBreakdown = {
  baseMinor: number;
  fields: BreakdownField[];
};

export type LineItemCustomization = {
  fieldValues: { label: string; value: string }[];
  priceFormatted: string | null;
  previewPriceMinor: number | null;
  breakdown: LineItemBreakdown | null;
  calculatedAt: string | null;
  ruleVersion: string | null;
  correlationId: string | null;
};

// Returns null when the line item has no etch customization attached.
export function parseLineItemCustomization(
  customAttributes: LineItemAttribute[]
): LineItemCustomization | null {
  const isCustomized = customAttributes.some((a) => a.key === "_etch_inputs");
  if (!isCustomized) return null;

  const fieldValues = customAttributes
    .filter((a) => !a.key.startsWith("_") && a.value)
    .map((a) => ({ label: a.key, value: a.value as string }));

  const get = (key: string) =>
    customAttributes.find((a) => a.key === key)?.value ?? null;

  let breakdown: LineItemBreakdown | null = null;
  const rawBreakdown = get("_etch_breakdown");
  if (rawBreakdown) {
    try {
      breakdown = JSON.parse(rawBreakdown) as LineItemBreakdown;
    } catch {
      breakdown = null;
    }
  }

  const rawPreviewPriceMinor = get("_etch_price_minor");
  const previewPriceMinor =
    rawPreviewPriceMinor != null && Number.isFinite(Number(rawPreviewPriceMinor))
      ? Number(rawPreviewPriceMinor)
      : null;

  return {
    fieldValues,
    priceFormatted: get("_etch_price"),
    previewPriceMinor,
    breakdown,
    calculatedAt: get("_etch_calculated_at"),
    ruleVersion: get("_etch_rule_version"),
    correlationId: get("_etch_correlation_id"),
  };
}

export function formatMinor(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}

// Converts a decimal money amount (e.g. "17.00") to integer minor units
// (1700), matching the format of _etch_price_minor for mismatch comparison.
export function dollarsToMinor(amount: string): number {
  return Math.round(parseFloat(amount) * 100);
}
