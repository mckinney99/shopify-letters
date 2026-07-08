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

type FieldCondition = {
  fieldId: string;
  triggerFieldId: string;
  operator: string;
  value: string;
};

type MetafieldPayload = {
  // Shop domain — Input.shop only exposes localTime/metafield, not an
  // identifier, so it travels via this payload instead (see SL-31).
  shop?: string;
  fields: FieldDefinition[];
  conditions?: FieldCondition[];
};

// ── Types for the Shopify Function input (mirrors cart_validations_generate_run.graphql) ──

type Metafield = { value: string } | null;

type ProductVariant = {
  __typename: "ProductVariant";
  id: string;
  product: { id: string; title: string; metafield: Metafield };
};

type UnknownMerchandise = { __typename: string };

type CartLine = {
  id: string;
  quantity: number;
  merchandise: ProductVariant | UnknownMerchandise;
  attribute: { value: string } | null; // attribute(key: "_etch_inputs")
  correlationAttribute: { value: string } | null; // attribute(key: "_etch_correlation_id")
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

// SL-85: skip validation for conditionally hidden fields.
function isFieldActive(
  fieldId: string,
  etchInputs: Record<string, string>,
  conditions: FieldCondition[]
): boolean {
  const cond = conditions.find((c) => c.fieldId === fieldId);
  if (!cond) return true;
  const triggerValue = (etchInputs[cond.triggerFieldId] ?? "").trim();
  return cond.operator === "equals" ? triggerValue === cond.value : true;
}

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
      errors.push(`Character${bad.length === 1 ? "" : "s"} ${bad.join(", ")} not allowed.`);
    }
  } else if (field.disallowedChars) {
    const disallowed = new Set([...field.disallowedChars]);
    const bad = [...new Set(chars.filter((c) => disallowed.has(c)))];
    if (bad.length > 0) {
      errors.push(`Character${bad.length === 1 ? "" : "s"} ${bad.join(", ")} not allowed.`);
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

// ── Structured logging — see SL-31 ────────────────────────────────────────────
// Every line that carries an Etch pricing metafield gets exactly one JSON log
// line, regardless of outcome, so support can query by correlationId across
// preview, add-to-cart, and checkout validation.

function logValidation(fields: {
  shop: string | null;
  productId: string;
  correlationId: string | null;
  pass: boolean;
  errorCount: number;
  reason?: string;
}): void {
  console.log(JSON.stringify({ event: "checkout_validation", ...fields }));
}

// ── Function entry point ──────────────────────────────────────────────────────

export function cartValidationsGenerateRun(input: Input): CartValidationsGenerateRunResult {
  const errors: ValidationError[] = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const variant = line.merchandise as ProductVariant;
    const metafieldRaw = variant.product.metafield?.value;
    if (!metafieldRaw) continue; // not an Etch-configured product

    let payload: MetafieldPayload;
    try {
      payload = JSON.parse(metafieldRaw) as MetafieldPayload;
    } catch {
      continue;
    }

    if (!Array.isArray(payload.fields) || payload.fields.length === 0) continue;

    const productId = variant.product.id;
    const correlationId = line.correlationAttribute?.value ?? null;
    const shop = payload.shop ?? null;
    const productTitle = variant.product.title;
    const attributeRaw = line.attribute?.value;
    const lineErrors: string[] = [];
    let reason: string | undefined;

    if (!attributeRaw) {
      reason = "missing_payload";
      lineErrors.push(
        `We couldn't find your customization details for "${productTitle}". Please go back to the product page and re-enter them.`
      );
    } else {
      try {
        const etchInputs = JSON.parse(attributeRaw) as Record<string, string>;
        const conditions = payload.conditions ?? [];
        for (const field of payload.fields) {
          if (!isFieldActive(field.id, etchInputs, conditions)) continue;
          for (const message of validateField(etchInputs[field.id] ?? "", field)) {
            lineErrors.push(`"${productTitle}" — ${field.label}: ${message}`);
          }
        }
        if (lineErrors.length > 0) reason = "validation_error";
      } catch {
        reason = "corrupt_payload";
        lineErrors.push(
          `We couldn't read your customization details for "${productTitle}". Please go back to the product page and re-enter them.`
        );
      }
    }

    logValidation({ shop, productId, correlationId, pass: lineErrors.length === 0, errorCount: lineErrors.length, reason });

    for (const message of lineErrors) {
      errors.push({ message, target: "$.cart" });
    }
  }

  const operations = errors.length > 0 ? [{ validationAdd: { errors } }] : [];
  return { operations };
}
