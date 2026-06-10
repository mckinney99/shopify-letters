// Cart Validation function — blocks checkout when a customized cart line's
// "_etch_inputs" payload is missing/corrupt or violates the product's
// per-field character rules from the "etch / pricing_rules" product metafield.
// Mirrors the input-reading conventions of extensions/etch-cart-transform/src/index.ts.

// ── Types for the metafield payload ──────────────────────────────────────────

type FieldDefinition = {
  id: string;
  label: string;
  minChars?: number | null;
  maxChars?: number | null;
  allowedChars?: string | null;
  disallowedChars?: string | null;
};

type MetafieldPayload = {
  fields: FieldDefinition[];
};

// ── Types for the Shopify Function input (mirrors cart_validations_generate_run.graphql) ──

type Metafield = { value: string } | null;

type ProductVariant = {
  __typename: "ProductVariant";
  id: string;
  product: { title: string; metafield: Metafield };
};

type UnknownMerchandise = { __typename: string };

type CartLine = {
  id: string;
  quantity: number;
  merchandise: ProductVariant | UnknownMerchandise;
  attribute: { value: string } | null; // attribute(key: "_etch_inputs")
};

type Input = {
  cart: { lines: CartLine[] };
};

// ── Output types (per cart.validations.generate.run schema) ──────────────────

type ValidationError = {
  message: string;
  target: string;
};

type CartValidationsGenerateRunResult = {
  operations: Array<{ validationAdd: { errors: ValidationError[] } }>;
};

// ── Validation logic — port of normalizeText/normalizeInput from app/utils/normalize.ts ──
// Must stay in sync with normalizeInput in normalize.ts.

function normalizeText(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function validateField(rawInput: string, field: FieldDefinition): string[] {
  const normalized = normalizeText(rawInput);
  const chars = [...normalized]; // codepoint-aware — correct for emoji
  const errors: string[] = [];

  if (field.allowedChars) {
    const allowed = new Set([...field.allowedChars]);
    const bad = [...new Set(chars.filter((c) => c !== " " && !allowed.has(c)))];
    if (bad.length > 0) {
      errors.push(`Contains characters not allowed: "${bad.join("")}"`);
    }
  } else if (field.disallowedChars) {
    const disallowed = new Set([...field.disallowedChars]);
    const bad = [...new Set(chars.filter((c) => disallowed.has(c)))];
    if (bad.length > 0) {
      errors.push(`Contains disallowed characters: "${bad.join("")}"`);
    }
  }

  if (field.minChars != null && chars.length < field.minChars) {
    errors.push(`Must be at least ${field.minChars} character${field.minChars === 1 ? "" : "s"}.`);
  }
  if (field.maxChars != null && chars.length > field.maxChars) {
    errors.push(`Must be at most ${field.maxChars} character${field.maxChars === 1 ? "" : "s"}.`);
  }

  return errors;
}

// ── Function entry point ──────────────────────────────────────────────────────

export function cartValidationsGenerateRun(input: Input): CartValidationsGenerateRunResult {
  const errors: ValidationError[] = [];

  console.error("[etch-validation] run — lines:", input.cart.lines.length);

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const variant = line.merchandise as ProductVariant;
    const metafieldRaw = variant.product.metafield?.value;
    if (!metafieldRaw) continue;

    let payload: MetafieldPayload;
    try {
      payload = JSON.parse(metafieldRaw) as MetafieldPayload;
    } catch {
      continue;
    }

    if (!Array.isArray(payload.fields) || payload.fields.length === 0) continue;

    const productTitle = variant.product.title;
    const attributeRaw = line.attribute?.value;

    if (!attributeRaw) {
      console.error("[etch-validation] line", line.id, "missing _etch_inputs for", productTitle);
      errors.push({
        message: `We couldn't find your customization details for "${productTitle}". Please go back to the product page and re-enter them.`,
        target: "$.cart",
      });
      continue;
    }

    let etchInputs: Record<string, string>;
    try {
      etchInputs = JSON.parse(attributeRaw) as Record<string, string>;
    } catch {
      console.error("[etch-validation] line", line.id, "corrupt _etch_inputs for", productTitle);
      errors.push({
        message: `We couldn't read your customization details for "${productTitle}". Please go back to the product page and re-enter them.`,
        target: "$.cart",
      });
      continue;
    }

    for (const field of payload.fields) {
      const fieldErrors = validateField(etchInputs[field.id] ?? "", field);
      for (const message of fieldErrors) {
        console.error("[etch-validation] line", line.id, "field", field.label, "error:", message);
        errors.push({
          message: `"${productTitle}" — ${field.label}: ${message}`,
          target: "$.cart",
        });
      }
    }
  }

  const operations = errors.length > 0 ? [{ validationAdd: { errors } }] : [];
  return { operations };
}
