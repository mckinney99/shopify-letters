import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { normalizeInput } from "../utils/normalize";
import { calculateProductPrice } from "../utils/pricing";
import type { FieldInput, FieldPricingRule } from "../utils/pricing";
import type { FieldRules } from "../utils/normalize";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// In-memory sliding-window rate limiter: 30 req / shop / 60s.
// Per-process only — sufficient for abuse prevention at this scale.
const rateLimitWindows = new Map<string, number[]>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(shop: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitWindows.get(shop) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateLimitWindows.set(shop, timestamps);
  return true;
}

// GET /api/preview?shop=...&productId=...
// Returns field definitions for a published product so the storefront
// can render the form before the shopper has typed anything.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const productId = url.searchParams.get("productId") ?? "";

  if (!shop || !productId) {
    return json({ error: "Missing shop or productId" }, { status: 400 });
  }

  if (!checkRateLimit(shop)) {
    return json({ error: "Too many requests" }, { status: 429 });
  }

  const productGid = `gid://shopify/Product/${productId}`;
  const [config, dbFields] = await Promise.all([
    prisma.productConfig.findUnique({
      where: { shop_productId: { shop, productId: productGid } },
      select: { published: true },
    }),
    prisma.customizationField.findMany({
      where: { shop, productId: productGid },
      orderBy: { position: "asc" },
      select: { id: true, label: true, minChars: true, maxChars: true, allowedChars: true, disallowedChars: true },
    }),
  ]);

  if (!config?.published) {
    return json({ error: "Not found" }, { status: 404 });
  }

  return json({ fields: dbFields }, { headers: CORS_HEADERS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Respond to CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: { shop?: unknown; productId?: unknown; fields?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { shop, productId, fields } = body;

  if (typeof shop !== "string" || !shop) {
    return json({ error: "Missing or invalid shop" }, { status: 400 });
  }
  if (typeof productId !== "string" || !productId) {
    return json({ error: "Missing or invalid productId" }, { status: 400 });
  }

  if (!checkRateLimit(shop)) {
    return json({ error: "Too many requests" }, { status: 429 });
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
    }),
    prisma.pricingRule.findMany({
      where: { shop, productId: productGid },
      include: { charGroups: true },
    }),
  ]);

  if (!config?.published) {
    return json(
      { error: "Product configuration not found or not published" },
      { status: 404 }
    );
  }

  // Normalize each field and collect errors
  const allErrors: string[] = [];
  const fieldInputs: FieldInput[] = [];

  for (const dbField of dbFields) {
    const raw = typeof fieldValues[dbField.id] === "string" ? fieldValues[dbField.id] : "";
    const fieldRule = pricingRules.find((r) => r.fieldId === dbField.id);
    const rules: FieldRules = {
      minChars: dbField.minChars,
      maxChars: dbField.maxChars,
      allowedChars: dbField.allowedChars,
      disallowedChars: dbField.disallowedChars,
      charGroups:
        fieldRule?.charGroups.map((g) => ({
          label: g.label,
          characters: g.characters,
        })) ?? [],
    };
    const normalized = normalizeInput(raw, rules);
    for (const e of normalized.errors) allErrors.push(`${dbField.label}: ${e}`);
    fieldInputs.push({ fieldId: dbField.id, normalizedText: normalized.normalizedText });
  }

  // Calculate price using canonical engine
  const ruleInputs: FieldPricingRule[] = pricingRules.map((r) => ({
    fieldId: r.fieldId,
    basePrice: r.basePrice,
    perCharPrice: r.perCharPrice,
    charGroups: r.charGroups.map((g) => ({
      label: g.label,
      characters: g.characters,
      pricePerChar: g.pricePerChar,
    })),
  }));

  const result = calculateProductPrice(fieldInputs, ruleInputs);
  for (const e of result.validationErrors) allErrors.push(e);

  return json(
    {
      valid: allErrors.length === 0,
      errors: allErrors,
      price: result.priceMinor,
      priceFormatted: `$${(result.priceMinor / 100).toFixed(2)}`,
      breakdown: result.breakdown,
    },
    { headers: CORS_HEADERS }
  );
};
