// Cart Transform function — enforces Etch per-character pricing at checkout.
// Cannot make network calls (Shopify Function constraint); pricing rules travel
// via the product metafield "etch / pricing_rules" written on every admin save.
// Field inputs travel via the "_etch_inputs" cart line attribute, written by
// the storefront extension as a JSON map of { [fieldId]: rawText }.

// ── Types for the metafield payload ──────────────────────────────────────────

type CharGroupRule = {
  label: string;
  characters: string;
  pricePerChar: number;
};

type FieldPricingRule = {
  fieldId: string;
  perCharPrice: number;
  charGroups: CharGroupRule[];
};

type FieldOptionRule = {
  label: string;
  priceDelta: number;
};

type FieldDefinition = {
  id: string;
  label: string;
  // Present on choice fields (dropdown/checkbox/buttons). The selected value
  // (an option label) travels in _etch_inputs; its priceDelta is added here.
  options?: FieldOptionRule[];
};

type MetafieldPayload = {
  // Shop domain — Input.shop only exposes localTime/metafield, not an
  // identifier, so it travels via this payload instead (see SL-31).
  shop?: string;
  fields: FieldDefinition[];
  rules: FieldPricingRule[];
};

// ── Types for the Shopify Function input (mirrors input.graphql) ──────────────
// CartLine exposes attribute(key:) singular only — no attributes array, so
// each distinct attribute needs its own (optionally aliased) query field.
// ProductVariant has no price field; currency is inferred by the runtime.

type Metafield = { value: string } | null;

type ProductVariant = {
  __typename: "ProductVariant";
  id: string;
  product: { id: string; metafield: Metafield };
};

type UnknownMerchandise = { __typename: string };

type CartLine = {
  id: string;
  quantity: number;
  merchandise: ProductVariant | UnknownMerchandise;
  cost: { amountPerQuantity: { amount: string } };
  attribute: { value: string } | null; // attribute(key: "_etch_inputs")
  correlationAttribute: { value: string } | null; // attribute(key: "_etch_correlation_id")
};

type Input = {
  cart: { lines: CartLine[] };
};

// ── Pricing engine — verbatim port of app/utils/normalize.ts ─────────────────
// Must stay in sync with normalizeText in normalize.ts.

function normalizeText(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

// ── Pricing engine — verbatim port of app/utils/pricing.ts ───────────────────
// Must stay in sync with calculateProductPrice in pricing.ts.

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

const MAX_PRICE_MINOR = 9_999_999;

function calculatePrice(
  fieldInputs: Array<{ fieldId: string; normalizedText: string }>,
  rules: FieldPricingRule[],
  baseMinor: number
): number {
  let total = baseMinor;

  for (const input of fieldInputs) {
    const rule = rules.find((r) => r.fieldId === input.fieldId);
    if (!rule) continue;
    const chars = [...input.normalizedText]; // codepoint-aware — correct for emoji
    for (const char of chars) {
      const group = rule.charGroups.find((g) => g.characters.includes(char));
      total += toCents(group ? group.pricePerChar : rule.perCharPrice);
    }
  }

  if (total < 0) total = 0;
  if (total > MAX_PRICE_MINOR) total = MAX_PRICE_MINOR;
  return total;
}

// Flat surcharge from selected choice-field options. The stored value in
// _etch_inputs is the chosen option's label; we add that option's priceDelta.
// Must stay in sync with the option pricing in app/routes/api.preview.ts.
function optionDeltaMinor(
  fields: FieldDefinition[],
  etchInputs: Record<string, string>
): number {
  let total = 0;
  for (const field of fields) {
    if (!field.options || field.options.length === 0) continue;
    const selected = etchInputs[field.id];
    if (!selected) continue;
    const option = field.options.find((o) => o.label === selected);
    if (option) total += toCents(option.priceDelta);
  }
  return total;
}

// ── Structured logging — see SL-31 ────────────────────────────────────────────
// Every line that carries an Etch pricing metafield gets exactly one JSON log
// line, regardless of outcome, so support can query by correlationId across
// preview, add-to-cart, and checkout enforcement.

type EnforcementLog = {
  event: "checkout_price_enforcement";
  shop: string | null;
  productId: string;
  correlationId: string | null;
  enforcedPriceMinor: number | null;
  pass: boolean;
  reason?: string;
};

function logEnforcement(fields: EnforcementLog): void {
  console.log(JSON.stringify(fields));
}

// ── Function entry point ──────────────────────────────────────────────────────

export function run(input: Input): unknown {
  const operations: unknown[] = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const variant = line.merchandise as ProductVariant;
    const metafieldRaw = variant.product.metafield?.value;
    if (!metafieldRaw) continue; // not an Etch-configured product

    const productId = variant.product.id;
    const correlationId = line.correlationAttribute?.value ?? null;

    try {
      let payload: MetafieldPayload;
      try {
        payload = JSON.parse(metafieldRaw) as MetafieldPayload;
      } catch {
        logEnforcement({ event: "checkout_price_enforcement", shop: null, productId, correlationId, enforcedPriceMinor: null, pass: false, reason: "invalid_metafield" });
        continue;
      }

      if (!Array.isArray(payload.fields) || !Array.isArray(payload.rules)) continue;
      if (payload.fields.length === 0 && payload.rules.length === 0) continue;

      const shop = payload.shop ?? null;

      // Read the bundled field inputs written by the storefront extension.
      // Format: { [fieldId]: rawText } — keyed by field ID, not label.
      const etchRaw = line.attribute?.value;
      if (!etchRaw) {
        logEnforcement({ event: "checkout_price_enforcement", shop, productId, correlationId, enforcedPriceMinor: null, pass: false, reason: "missing_inputs" });
        continue;
      }

      let etchInputs: Record<string, string>;
      try {
        etchInputs = JSON.parse(etchRaw) as Record<string, string>;
      } catch {
        logEnforcement({ event: "checkout_price_enforcement", shop, productId, correlationId, enforcedPriceMinor: null, pass: false, reason: "corrupt_inputs" });
        continue;
      }

      const fieldInputs = payload.fields.map((fieldDef) => ({
        fieldId: fieldDef.id,
        normalizedText: normalizeText(etchInputs[fieldDef.id] ?? ""),
      }));

      const baseMinor = Math.round(parseFloat(line.cost.amountPerQuantity.amount) * 100);
      let enforcedMinor = calculatePrice(fieldInputs, payload.rules, baseMinor);
      enforcedMinor += optionDeltaMinor(payload.fields, etchInputs);
      if (enforcedMinor > MAX_PRICE_MINOR) enforcedMinor = MAX_PRICE_MINOR;
      const enforcedAmount = (enforcedMinor / 100).toFixed(2);

      logEnforcement({ event: "checkout_price_enforcement", shop, productId, correlationId, enforcedPriceMinor: enforcedMinor, pass: true });

      // Operation structure per CartTransformRunResult schema (2025-10):
      // lineExpand > expandedCartItems[].price.adjustment.fixedPricePerUnit.amount
      // Currency is inferred from the cart's presentment currency — not specified here.
      operations.push({
        lineExpand: {
          cartLineId: line.id,
          expandedCartItems: [
            {
              merchandiseId: variant.id,
              quantity: line.quantity,
              price: {
                adjustment: {
                  fixedPricePerUnit: {
                    amount: enforcedAmount,
                  },
                },
              },
            },
          ],
        },
      });
    } catch {
      // Catch-all for unexpected errors (e.g. malformed rules data) so one
      // bad line doesn't crash enforcement for the whole cart (see SL-32).
      logEnforcement({ event: "checkout_price_enforcement", shop: null, productId, correlationId, enforcedPriceMinor: null, pass: false, reason: "function_error" });
    }
  }

  return { operations };
}
