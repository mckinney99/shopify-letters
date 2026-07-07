import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { normalizeInput } from "../utils/normalize";
import { calculateProductPrice } from "../utils/pricing";
import type { FieldInput, FieldPricingRule } from "../utils/pricing";
import type { FieldRules } from "../utils/normalize";
import { buildPricingConfig, computeConfigVersion } from "../utils/pricingConfig";
import { logEvent, shortHash } from "../utils/log";
import { recordPreviewLatency } from "../utils/metrics";
import { makeRateLimiter } from "../utils/rateLimit";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// 30 req / shop / 60s.
const checkRateLimit = makeRateLimiter(30, 60_000);

// GET /api/preview?shop=...&productId=...
// Returns field definitions for a published product so the storefront
// can render the form before the shopper has typed anything.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Remix may route OPTIONS to loader for resource routes.
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const productId = url.searchParams.get("productId") ?? "";

  if (!shop || !productId) {
    return json({ error: "Missing shop or productId" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!checkRateLimit(shop)) {
    return json({ error: "Too many requests" }, { status: 429, headers: CORS_HEADERS });
  }

  const productGid = `gid://shopify/Product/${productId}`;
  const [config, dbFields, pricingRules] = await Promise.all([
    prisma.productConfig.findUnique({
      where: { shop_productId: { shop, productId: productGid } },
      select: { published: true },
    }),
    prisma.customizationField.findMany({
      where: { shop, productId: productGid },
      orderBy: { position: "asc" },
      select: {
        id: true, label: true, type: true, required: true,
        minChars: true, maxChars: true, allowedChars: true, disallowedChars: true,
        allowSpaces: true, countSpaces: true,
        options: { select: { label: true, priceDelta: true, swatchColor: true }, orderBy: { position: "asc" } },
      },
    }),
    prisma.pricingRule.findMany({
      where: { shop, productId: productGid, fieldId: { not: "" } },
      select: { fieldId: true, perCharPrice: true, charGroups: { select: { label: true, pricePerChar: true } } },
    }),
  ]);

  if (!config?.published) {
    return json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  }

  const ruleByFieldId = Object.fromEntries(pricingRules.map((r) => [r.fieldId, r]));
  const fields = dbFields.map((f) => ({
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
    perCharPrice: ruleByFieldId[f.id]?.perCharPrice ?? null,
    charGroups: ruleByFieldId[f.id]?.charGroups ?? [],
  }));

  return json({ fields }, { headers: CORS_HEADERS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Respond to CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
  }

  const startedAt = Date.now();

  let body: { shop?: unknown; productId?: unknown; fields?: unknown; correlationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
  }

  const { shop, productId, fields, correlationId } = body;

  if (typeof shop !== "string" || !shop) {
    return json({ error: "Missing or invalid shop" }, { status: 400, headers: CORS_HEADERS });
  }
  if (typeof productId !== "string" || !productId) {
    return json({ error: "Missing or invalid productId" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!checkRateLimit(shop)) {
    return json({ error: "Too many requests" }, { status: 429, headers: CORS_HEADERS });
  }

  const fieldValues: Record<string, string> =
    fields && typeof fields === "object" && !Array.isArray(fields)
      ? (fields as Record<string, string>)
      : {};

  const productGid = `gid://shopify/Product/${productId}`;

  const [config, dbFields, pricingRules] = await Promise.all([
    prisma.productConfig.findUnique({
      where: { shop_productId: { shop, productId: productGid } },
      select: { published: true },
    }),
    prisma.customizationField.findMany({
      where: { shop, productId: productGid },
      orderBy: { position: "asc" },
      include: { options: { orderBy: { position: "asc" } } },
    }),
    prisma.pricingRule.findMany({
      where: { shop, productId: productGid },
      include: { charGroups: true },
    }),
  ]);

  if (!config?.published) {
    return json(
      { error: "Product configuration not found or not published" },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  // Normalize each field and collect errors
  const allErrors: string[] = [];
  const fieldInputs: FieldInput[] = [];
  // Flat surcharge from selected choice-field options (dropdown/checkbox/buttons).
  // Mirrors optionDeltaMinor() in the cart transform so preview == enforced price.
  let optionDeltaMinor = 0;

  for (const dbField of dbFields) {
    const raw = typeof fieldValues[dbField.id] === "string" ? fieldValues[dbField.id] : "";

    // Choice fields carry a selected option label rather than free text.
    if (dbField.options && dbField.options.length > 0) {
      const selected = raw.trim();
      if (!selected) {
        if (dbField.required) allErrors.push(`${dbField.label}: Please select an option.`);
      } else {
        const opt = dbField.options.find((o) => o.label === selected);
        if (!opt) allErrors.push(`${dbField.label}: Invalid selection.`);
        else optionDeltaMinor += Math.round(opt.priceDelta * 100);
      }
      continue; // no per-character pricing for choice fields
    }

    const fieldRule = pricingRules.find((r) => r.fieldId === dbField.id);
    const rules: FieldRules = {
      minChars: dbField.minChars,
      maxChars: dbField.maxChars,
      allowedChars: dbField.allowedChars,
      disallowedChars: dbField.disallowedChars,
      allowSpaces: dbField.allowSpaces,
      charGroups:
        fieldRule?.charGroups.map((g) => ({
          label: g.label,
          characters: g.characters,
        })) ?? [],
    };
    const normalized = normalizeInput(raw, rules);
    for (const e of normalized.errors) allErrors.push(`${dbField.label}: ${e}`);
    const pricingText = dbField.countSpaces
      ? normalized.normalizedText
      : normalized.normalizedText.replace(/ /g, "");
    fieldInputs.push({ fieldId: dbField.id, normalizedText: pricingText });
  }

  // Calculate price using canonical engine — base rule excluded; variant price
  // is the base and is enforced by the cart transform reading cost.amountPerQuantity.
  const ruleInputs: FieldPricingRule[] = pricingRules
    .filter((r) => r.fieldId !== "")
    .map((r) => ({
      fieldId: r.fieldId,
      basePrice: 0,
      perCharPrice: r.perCharPrice,
      charGroups: r.charGroups.map((g) => ({
        label: g.label,
        characters: g.characters,
        pricePerChar: g.pricePerChar,
      })),
    }));

  const result = calculateProductPrice(fieldInputs, ruleInputs);
  for (const e of result.validationErrors) allErrors.push(e);

  // Fold in choice-option surcharges (kept out of the per-char engine so the
  // well-tested char pricing stays untouched). Clamp mirrors the engine's cap.
  const MAX_PRICE_MINOR = 9_999_999;
  const totalPriceMinor = Math.min(result.priceMinor + optionDeltaMinor, MAX_PRICE_MINOR);

  // Snapshot ID for the rules used to calculate this price — attached to the
  // cart line item so support can later verify which config version produced
  // a given price (see SL-30).
  const configVersion = computeConfigVersion(buildPricingConfig(dbFields, pricingRules));

  // Hash of the customer's raw input — lets support correlate a disputed
  // price with what was actually typed, without logging the input itself.
  const sortedFieldValues = Object.keys(fieldValues)
    .sort()
    .reduce<Record<string, string>>((acc, key) => {
      acc[key] = fieldValues[key];
      return acc;
    }, {});
  const inputHash = shortHash(JSON.stringify(sortedFieldValues));

  const latencyMs = Date.now() - startedAt;
  recordPreviewLatency(shop, latencyMs);

  logEvent("preview_request", {
    shop,
    productId: productGid,
    correlationId: typeof correlationId === "string" ? correlationId : null,
    inputHash,
    valid: allErrors.length === 0,
    priceMinor: totalPriceMinor,
    latencyMs,
  });

  return json(
    {
      valid: allErrors.length === 0,
      errors: allErrors,
      price: totalPriceMinor,
      priceFormatted: `$${(totalPriceMinor / 100).toFixed(2)}`,
      breakdown: result.breakdown,
      configVersion,
    },
    { headers: CORS_HEADERS }
  );
};
