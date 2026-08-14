import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { createHmac, timingSafeEqual } from "node:crypto";
import prisma from "../db.server";
import { normalizeInput } from "../utils/normalize";
import { calculateProductPrice } from "../utils/pricing";
import type { FieldInput, FieldPricingRule, PricingCondition } from "../utils/pricing";
import type { FieldRules } from "../utils/normalize";
import { buildPricingConfig, computeConfigVersion } from "../utils/pricingConfig";
import { buildStorefrontConfig } from "../utils/storefrontConfig";
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
  const previewToken = url.searchParams.get("preview_token") ?? "";

  if (!shop || !productId) {
    return json({ error: "Missing shop or productId" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!checkRateLimit(shop)) {
    return json({ error: "Too many requests" }, { status: 429, headers: CORS_HEADERS });
  }

  let previewMode = false;
  if (previewToken) {
    const secret = process.env.SHOPIFY_API_SECRET;
    const dotIdx = previewToken.indexOf(".");
    if (secret && dotIdx > 0) {
      const expiry = parseInt(previewToken.slice(0, dotIdx), 10);
      const hmac = previewToken.slice(dotIdx + 1);
      if (!isNaN(expiry) && expiry > Date.now()) {
        const expected = createHmac("sha256", secret).update(`${shop}:${productId}:${expiry}`).digest("hex");
        try {
          const hmacBuf = Buffer.from(hmac, "hex");
          const expectedBuf = Buffer.from(expected, "hex");
          if (hmacBuf.length === expectedBuf.length && timingSafeEqual(hmacBuf, expectedBuf)) {
            previewMode = true;
          }
        } catch {}
      }
    }
  }

  const productGid = `gid://shopify/Product/${productId}`;
  const config = await prisma.productConfig.findUnique({
    where: { shop_productId: { shop, productId: productGid } },
    select: { published: true, previewEnabled: true, publishedConfig: true },
  });

  if (!config?.published && !previewMode) {
    return json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  }

  // SL-123: customers see the last-published snapshot. Admin "Preview on store"
  // (previewMode) — and products published before snapshots existed (no snapshot yet)
  // — fall back to the live draft so nothing breaks until the first explicit publish.
  const snap = config?.publishedConfig as
    | { fields: unknown[]; pricingRules: unknown[]; conditions: unknown[] }
    | null;
  let built;
  if (previewMode || !snap) {
    const [dbFields, pricingRules, conditions] = await Promise.all([
      prisma.customizationField.findMany({
        where: { shop, productId: productGid },
        orderBy: { position: "asc" },
        include: { options: { orderBy: { position: "asc" } } },
      }),
      prisma.pricingRule.findMany({
        where: { shop, productId: productGid },
        include: { charGroups: true },
      }),
      prisma.fieldCondition.findMany({
        where: { shop, productId: productGid },
        select: { fieldId: true, triggerFieldId: true, operator: true, value: true },
      }),
    ]);
    built = buildStorefrontConfig(dbFields as any, pricingRules as any, conditions);
  } else {
    built = buildStorefrontConfig(snap.fields as any, snap.pricingRules as any, snap.conditions as any);
  }

  return json(
    { fields: built.fields, conditions: built.conditions, previewEnabled: config?.previewEnabled ?? false, previewMode },
    { headers: CORS_HEADERS }
  );
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

  let body: { shop?: unknown; productId?: unknown; fields?: unknown; correlationId?: unknown; baseMinor?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
  }

  const { shop, productId, fields, correlationId, baseMinor } = body;

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

  const productBaseMinor = typeof baseMinor === "number" && baseMinor >= 0 ? Math.round(baseMinor) : 0;

  const config = await prisma.productConfig.findUnique({
    where: { shop_productId: { shop, productId: productGid } },
    select: { published: true, publishedConfig: true },
  });

  if (!config?.published) {
    return json(
      { error: "Product configuration not found or not published" },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  // SL-123: the price preview must match what checkout enforces, so it reads the
  // published snapshot (same source the pricing metafield was built from). Products
  // published before snapshots existed fall back to the live draft.
  const snap = config.publishedConfig as
    | { fields: any[]; pricingRules: any[]; conditions: any[] }
    | null;
  let dbFields: any[];
  let pricingRules: any[];
  let dbConditions: any[];
  if (snap) {
    dbFields = snap.fields;
    pricingRules = snap.pricingRules;
    dbConditions = snap.conditions;
  } else {
    [dbFields, pricingRules, dbConditions] = await Promise.all([
      prisma.customizationField.findMany({
        where: { shop, productId: productGid },
        orderBy: { position: "asc" },
        include: { options: { orderBy: { position: "asc" } } },
      }),
      prisma.pricingRule.findMany({
        where: { shop, productId: productGid },
        include: { charGroups: true },
      }),
      prisma.fieldCondition.findMany({
        where: { shop, productId: productGid },
        select: { fieldId: true, triggerFieldId: true, operator: true, value: true },
      }),
    ]);
  }

  // Normalize each field and collect errors
  const allErrors: string[] = [];
  const fieldInputs: FieldInput[] = [];
  // Flat surcharge from selected choice-field options (dropdown/checkbox/buttons).
  // Mirrors optionDeltaMinor() in the cart transform so preview == enforced price.
  let optionDeltaMinor = 0;

  for (const dbField of dbFields) {
    const raw = typeof fieldValues[dbField.id] === "string" ? fieldValues[dbField.id] : "";

    // Display-only elements — no input, no pricing, no validation.
    if (dbField.type === "text-block" || dbField.type === "image-static") continue;

    // Upload fields — validate required (value is the uploaded URL).
    if (dbField.type === "upload") {
      if (dbField.required && !raw.trim()) allErrors.push(`${dbField.label}: Please upload a file.`);
      continue;
    }

    // Number fields — validate numeric bounds (minChars/maxChars reused as min/max value).
    if (dbField.type === "number") {
      if (raw.trim() === "") {
        if (dbField.required) allErrors.push(`${dbField.label}: This field is required.`);
      } else {
        const n = Number(raw);
        if (isNaN(n)) allErrors.push(`${dbField.label}: Must be a number.`);
        else {
          if (dbField.minChars != null && n < dbField.minChars) allErrors.push(`${dbField.label}: Must be at least ${dbField.minChars}.`);
          if (dbField.maxChars != null && n > dbField.maxChars) allErrors.push(`${dbField.label}: Must be at most ${dbField.maxChars}.`);
        }
      }
      continue;
    }

    // Date fields — validate format and optional future-only constraint.
    if (dbField.type === "date") {
      if (raw.trim() === "") {
        if (dbField.required) allErrors.push(`${dbField.label}: This field is required.`);
      } else {
        const d = new Date(raw);
        if (isNaN(d.getTime())) allErrors.push(`${dbField.label}: Must be a valid date.`);
        else if (dbField.dateFutureOnly && d < new Date()) allErrors.push(`${dbField.label}: Must be a future date.`);
      }
      continue;
    }

    // Choice fields carry a selected option label rather than free text.
    if (dbField.options && dbField.options.length > 0) {
      const selected = raw.trim();
      if (!selected) {
        if (dbField.required) allErrors.push(`${dbField.label}: Please select an option.`);
      } else {
        const opt = dbField.options.find((o: any) => o.label === selected);
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
        fieldRule?.charGroups.map((g: any) => ({
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
      mode: (r.mode as "per_char" | "flat" | "percent") ?? "per_char",
      amount: r.amount ?? 0,
      charGroups: r.charGroups.map((g: any) => ({
        label: g.label,
        characters: g.characters,
        pricePerChar: g.pricePerChar,
      })),
    }));

  const conditions: PricingCondition[] = dbConditions;
  const result = calculateProductPrice(fieldInputs, ruleInputs, productBaseMinor, conditions);
  for (const e of result.validationErrors) allErrors.push(e);

  // Fold in choice-option surcharges (kept out of the per-char engine so the
  // well-tested char pricing stays untouched). Clamp mirrors the engine's cap.
  const MAX_PRICE_MINOR = 9_999_999;
  const totalPriceMinor = Math.min(result.priceMinor + optionDeltaMinor, MAX_PRICE_MINOR);

  // Snapshot ID for the rules used to calculate this price — attached to the
  // cart line item so support can later verify which config version produced
  // a given price (see SL-30).
  const configVersion = computeConfigVersion(buildPricingConfig(dbFields, pricingRules, dbConditions));

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
