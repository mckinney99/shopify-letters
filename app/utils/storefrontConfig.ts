// Builds the storefront-facing config (field definitions + conditions) the widget
// renders. Used in two places so the shape stays identical (SL-123):
//   - api.preview live/preview mode (build from current DB rows)
//   - the "Publish changes" action (snapshot the draft into ProductConfig.publishedConfig)
// Pure — callers do the Prisma queries and pass the rows in.

type DbOption = { label: string; priceDelta: number; swatchColor: string | null; imageUrl: string | null };

export type StorefrontFieldRow = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  minChars: number | null;
  maxChars: number | null;
  allowedChars: string | null;
  disallowedChars: string | null;
  allowSpaces: boolean;
  countSpaces: boolean;
  helpText: string | null;
  dateFutureOnly: boolean;
  fontOptions: unknown;
  textColorOptions: unknown;
  fontSizeOptions: unknown;
  fileAccept: string | null;
  previewX: number | null;
  previewY: number | null;
  previewW: number | null;
  previewH: number | null;
  previewRotation: number | null;
  options: DbOption[];
};

export type StorefrontPricingRow = {
  fieldId: string;
  perCharPrice: number | null;
  mode: string;
  amount: number;
  charGroups: { label: string; pricePerChar: number }[];
};

export type StorefrontConditionRow = {
  fieldId: string;
  triggerFieldId: string;
  operator: string;
  value: string;
};

export type StorefrontConfig = {
  fields: ReturnType<typeof buildStorefrontFields>;
  conditions: { fieldId: string; triggerFieldId: string; operator: string; value: string }[];
};

export function buildStorefrontFields(dbFields: StorefrontFieldRow[], pricingRules: StorefrontPricingRow[]) {
  const ruleByFieldId = Object.fromEntries(pricingRules.map((r) => [r.fieldId, r]));
  return dbFields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    required: f.required,
    minChars: f.minChars,
    maxChars: f.maxChars,
    allowedChars: f.allowedChars,
    disallowedChars: f.disallowedChars,
    allowSpaces: f.allowSpaces,
    countSpaces: f.countSpaces,
    options: f.options,
    helpText: f.helpText,
    dateFutureOnly: f.dateFutureOnly,
    fontOptions: f.fontOptions,
    textColorOptions: f.textColorOptions,
    fontSizeOptions: f.fontSizeOptions,
    fileAccept: f.fileAccept,
    perCharPrice: ruleByFieldId[f.id]?.perCharPrice ?? null,
    mode: ruleByFieldId[f.id]?.mode ?? "per_char",
    amount: ruleByFieldId[f.id]?.amount ?? 0,
    charGroups: ruleByFieldId[f.id]?.charGroups ?? [],
    previewX: f.previewX,
    previewY: f.previewY,
    previewW: f.previewW,
    previewH: f.previewH,
    previewRotation: f.previewRotation,
  }));
}

export function buildStorefrontConfig(
  dbFields: StorefrontFieldRow[],
  pricingRules: StorefrontPricingRow[],
  conditions: StorefrontConditionRow[],
): StorefrontConfig {
  return {
    fields: buildStorefrontFields(dbFields, pricingRules),
    conditions: conditions.map((c) => ({
      fieldId: c.fieldId,
      triggerFieldId: c.triggerFieldId,
      operator: c.operator,
      value: c.value,
    })),
  };
}
