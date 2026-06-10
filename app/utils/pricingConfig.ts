import { createHash } from "crypto";

// Canonical shape of a product's customization + pricing configuration.
// Used both to populate the `etch/pricing_rules` metafield (read by the
// Cart Transform function) and to derive a config snapshot ID that gets
// attached to cart/order line items — see SL-30.

export type PricingConfigField = {
  id: string;
  label: string;
  minChars: number | null;
  maxChars: number | null;
  allowedChars: string | null;
  disallowedChars: string | null;
};

export type PricingConfigCharGroup = {
  label: string;
  characters: string;
  pricePerChar: number;
};

export type PricingConfigRule = {
  fieldId: string;
  basePrice: number;
  perCharPrice: number;
  charGroups: PricingConfigCharGroup[];
};

export type PricingConfig = {
  fields: PricingConfigField[];
  rules: PricingConfigRule[];
};

type DbField = {
  id: string;
  label: string;
  minChars: number | null;
  maxChars: number | null;
  allowedChars: string | null;
  disallowedChars: string | null;
};

type DbCharGroup = {
  label: string;
  characters: string;
  pricePerChar: number;
};

type DbPricingRule = {
  fieldId: string;
  basePrice: number;
  perCharPrice: number;
  charGroups: DbCharGroup[];
};

// Builds the canonical config shape from Prisma rows. Field/rule order
// matters for the hash, so callers should pass rows ordered consistently
// (e.g. fields by `position`).
export function buildPricingConfig(fields: DbField[], rules: DbPricingRule[]): PricingConfig {
  return {
    fields: fields.map((f) => ({
      id: f.id,
      label: f.label,
      minChars: f.minChars,
      maxChars: f.maxChars,
      allowedChars: f.allowedChars,
      disallowedChars: f.disallowedChars,
    })),
    rules: rules.map((r) => ({
      fieldId: r.fieldId,
      basePrice: r.basePrice,
      perCharPrice: r.perCharPrice,
      charGroups: r.charGroups.map((g) => ({
        label: g.label,
        characters: g.characters,
        pricePerChar: g.pricePerChar,
      })),
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
