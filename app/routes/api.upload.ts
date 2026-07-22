// POST /api/upload — accepts a storefront file upload, stores it via Shopify
// staged uploads using the merchant's stored admin token, and returns a CDN URL.
// Called from the etch-customization widget when a shopper selects a file for
// an "upload" field. Intentionally unauthenticated (storefront-accessible) but
// rate-limited per shop and size-limited to 10 MB.

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";
import { makeRateLimiter } from "../utils/rateLimit";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// 10 uploads / shop / 60s — generous but bounded.
const checkRateLimit = makeRateLimiter(10, 60_000);

const STAGED_UPLOADS_CREATE = `
  mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Invalid form data" }, { status: 400, headers: CORS_HEADERS });
  }

  const shop = (formData.get("shop") as string | null) ?? "";
  const file = formData.get("file") as File | null;

  if (!shop) return json({ error: "Missing shop" }, { status: 400, headers: CORS_HEADERS });
  if (!file) return json({ error: "Missing file" }, { status: 400, headers: CORS_HEADERS });

  if (file.size > MAX_BYTES) {
    return json({ error: "File too large (max 10 MB)" }, { status: 413, headers: CORS_HEADERS });
  }

  if (!checkRateLimit(shop)) {
    return json({ error: "Too many uploads" }, { status: 429, headers: CORS_HEADERS });
  }

  // Use the stored offline admin token for this shop.
  let admin: Awaited<ReturnType<typeof unauthenticated.admin>>["admin"];
  try {
    ({ admin } = await unauthenticated.admin(shop));
  } catch {
    return json({ error: "Shop not found or app not installed" }, { status: 403, headers: CORS_HEADERS });
  }

  // Step 1: Create a staged upload target.
  let stagedRes: Response;
  try {
    stagedRes = await admin.graphql(STAGED_UPLOADS_CREATE, {
      variables: {
        input: [{ filename: file.name, mimeType: file.type || "application/octet-stream", resource: "FILE", fileSize: String(file.size) }],
      },
    });
  } catch (err) {
    console.error("[api.upload] stagedUploadsCreate error:", err);
    return json({ error: "Failed to create upload" }, { status: 502, headers: CORS_HEADERS });
  }

  const { data } = await stagedRes.json();
  const target = data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    const errs = data?.stagedUploadsCreate?.userErrors ?? [];
    console.error("[api.upload] stagedUploadsCreate userErrors:", errs);
    return json({ error: "Upload setup failed" }, { status: 502, headers: CORS_HEADERS });
  }

  // Step 2: Upload the file to the staged URL with the required parameters.
  const uploadForm = new FormData();
  for (const { name, value } of target.parameters) {
    uploadForm.append(name, value);
  }
  uploadForm.append("file", file);

  // DEBUG (temporary): capture the exact staged target + params + file meta so we can
  // pin down the GCS SignatureDoesNotMatch. Values redacted to lengths.
  console.error("[api.upload][debug] target.url:", target.url);
  console.error("[api.upload][debug] param order:", target.parameters.map((p: any) => `${p.name}(len=${String(p.value).length})`).join(", "));
  console.error("[api.upload][debug] file meta:", JSON.stringify({ name: file.name, type: file.type, size: file.size }));

  try {
    const uploadRes = await fetch(target.url, { method: "POST", body: uploadForm });
    if (!uploadRes.ok) {
      const body = await uploadRes.text();
      console.error("[api.upload] staged PUT failed:", uploadRes.status, "FULLBODY>>>", body, "<<<FULLBODY");
      return json({ error: "Upload failed" }, { status: 502, headers: CORS_HEADERS });
    }
  } catch (err) {
    console.error("[api.upload] staged PUT exception:", err);
    return json({ error: "Upload failed" }, { status: 502, headers: CORS_HEADERS });
  }

  return json({ url: target.resourceUrl }, { headers: CORS_HEADERS });
};

// Remix calls loader for non-POST methods on resource routes — return 405.
export const loader = () =>
  json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
