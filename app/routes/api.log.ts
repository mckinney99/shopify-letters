import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { logEvent } from "../utils/log";
import { makeRateLimiter } from "../utils/rateLimit";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// 30 req / shop / 60s.
const checkRateLimit = makeRateLimiter(30, 60_000);

// POST /api/log
// Records storefront add-to-cart events for an Etch-customized line, so
// support can trace a "preview_request" through to the cart and on to the
// checkout function logs via a shared correlationId — see SL-31.
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: { shop?: unknown; productId?: unknown; correlationId?: unknown; payloadSize?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { shop, productId, correlationId, payloadSize } = body;

  if (typeof shop !== "string" || !shop) {
    return json({ error: "Missing or invalid shop" }, { status: 400 });
  }
  if (typeof productId !== "string" || !productId) {
    return json({ error: "Missing or invalid productId" }, { status: 400 });
  }

  if (!checkRateLimit(shop)) {
    return json({ error: "Too many requests" }, { status: 429 });
  }

  logEvent("add_to_cart", {
    shop,
    productId: `gid://shopify/Product/${productId}`,
    correlationId: typeof correlationId === "string" ? correlationId : null,
    payloadSize: typeof payloadSize === "number" ? payloadSize : null,
  });

  return json({ ok: true }, { headers: CORS_HEADERS });
};
