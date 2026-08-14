import { createHash } from "crypto";

// Canonical shape of a product's customization + pricing configuration.
// Used both to populate the `etch/pricing_rules` metafield (read by the
// Cart Transform function) and to derive a config snapshot ID that gets
// attached to cart/order line items — see SL-30.

export type PricingConfigOption = {
  label: string;
  priceDelta: number;
};

export type PricingConfigField = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  minChars: number | null;
  maxChars: number | null;
  allowedChars: string | null;
  disallowedChars: string | null;
  dateFutureOnly?: boolean;
  // Choice-field options (dropdown/checkbox/buttons). Empty for text fields.
  options: PricingConfigOption[];
};

export type PricingConfigCharGroup = {
  label: string;
  characters: string;
  pricePerChar: number;
};

export type PricingConfigRule = {
  fieldId: string;
  perCharPrice: number;
  mode: string;    // per_char | flat | percent
  amount: number;
  charGroups: PricingConfigCharGroup[];
};

export type PricingConfigCondition = {
  fieldId: string;
  triggerFieldId: string;
  operator: string;
  value: string;
};

export type PricingConfig = {
  fields: PricingConfigField[];
  rules: PricingConfigRule[];
  conditions: PricingConfigCondition[];
};

type DbFieldOption = {
  label: string;
  priceDelta: number;
};

type DbField = {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  minChars: number | null;
  maxChars: number | null;
  allowedChars: string | null;
  disallowedChars: string | null;
  dateFutureOnly?: boolean;
  options?: DbFieldOption[];
};

type DbCharGroup = {
  label: string;
  characters: string;
  pricePerChar: number;
};

type DbPricingRule = {
  fieldId: string;
  perCharPrice: number;
  mode?: string;
  amount?: number;
  charGroups: DbCharGroup[];
};

type DbCondition = {
  fieldId: string;
  triggerFieldId: string;
  operator: string;
  value: string;
};

// Builds the canonical config shape from Prisma rows. Field/rule order
// matters for the hash, so callers should pass rows ordered consistently
// (e.g. fields by `position`).
export function buildPricingConfig(
  fields: DbField[],
  rules: DbPricingRule[],
  conditions: DbCondition[] = []
): PricingConfig {
  return {
    fields: fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type ?? "text",
      required: f.required ?? false,
      minChars: f.minChars,
      maxChars: f.maxChars,
      allowedChars: f.allowedChars,
      disallowedChars: f.disallowedChars,
      dateFutureOnly: f.dateFutureOnly ?? false,
      options: (f.options ?? []).map((o) => ({ label: o.label, priceDelta: o.priceDelta })),
    })),
    rules: rules
      .filter((r) => r.fieldId !== "")
      .map((r) => ({
        fieldId: r.fieldId,
        perCharPrice: r.perCharPrice,
        mode: r.mode ?? "per_char",
        amount: r.amount ?? 0,
        charGroups: r.charGroups.map((g) => ({
          label: g.label,
          characters: g.characters,
          pricePerChar: g.pricePerChar,
        })),
      })),
    conditions: conditions.map((c) => ({
      fieldId: c.fieldId,
      triggerFieldId: c.triggerFieldId,
      operator: c.operator,
      value: c.value,
    })),
  };
}

// Short, deterministic identifier for a pricing configuration. Changes
// whenever fields or pricing rules change, so it can be attached to order
// line items as an audit trail for "why was this priced this way" support
// cases (SL-30).
export function computeConfigVersion(config: PricingConfig): string {
  const json = JSON.stringify(config);
  return createHash("sha256").update(json).digest("hex").slice(0, 12);
}
