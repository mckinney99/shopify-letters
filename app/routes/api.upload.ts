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

  // Step 2: Upload the bytes. Shopify staged FILE/IMAGE targets are Google Cloud
  // Storage V4 *pre-signed URLs* (X-Goog-Signature in the query, SignedHeaders=host)
  // — they require a PUT of the raw body. A multipart POST (params as form fields)
  // makes Google recompute a different signature → 403 SignatureDoesNotMatch (SL-122).
  // Only `host` is signed, so we send just the body + Content-Type (no x-goog-* headers).
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const putRes = await fetch(target.url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: bytes,
    });
    if (!putRes.ok) {
      const body = await putRes.text();
      console.error("[api.upload] staged PUT failed:", putRes.status, body.slice(0, 300));
      return json({ error: "Upload failed" }, { status: 502, headers: CORS_HEADERS });
    }
  } catch (err) {
    console.error("[api.upload] staged PUT exception:", err);
    return json({ error: "Upload failed" }, { status: 502, headers: CORS_HEADERS });
  }

  // Step 3: register the staged object with the Files API so it becomes a permanent
  // Shopify CDN asset — staged uploads are temporary and get garbage-collected, so we
  // can't just return resourceUrl.
  const isImage = (file.type || "").startsWith("image/");
  const FILE_CREATE = `
    mutation FileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          ... on MediaImage { image { url } }
          ... on GenericFile { url }
        }
        userErrors { field message }
      }
    }`;
  let fileId: string;
  let cdnUrl: string | null;
  try {
    const res = await admin.graphql(FILE_CREATE, {
      variables: { files: [{ originalSource: target.resourceUrl, contentType: isImage ? "IMAGE" : "FILE" }] },
    });
    const { data: fcData } = await res.json();
    const created = fcData?.fileCreate?.files?.[0];
    const errs = fcData?.fileCreate?.userErrors ?? [];
    if (!created || errs.length) {
      console.error("[api.upload] fileCreate userErrors:", errs);
      return json({ error: "Upload registration failed" }, { status: 502, headers: CORS_HEADERS });
    }
    fileId = created.id;
    cdnUrl = created.image?.url ?? created.url ?? null;
  } catch (err) {
    console.error("[api.upload] fileCreate error:", err);
    return json({ error: "Upload registration failed" }, { status: 502, headers: CORS_HEADERS });
  }

  // Step 4: the CDN url is often null immediately after fileCreate (still processing) —
  // poll the file node briefly until it resolves.
  const FILE_NODE = `
    query FileNode($id: ID!) {
      node(id: $id) {
        ... on MediaImage { fileStatus image { url } }
        ... on GenericFile { fileStatus url }
      }
    }`;
  for (let i = 0; i < 10 && !cdnUrl; i++) {
    await new Promise((r) => setTimeout(r, 600));
    try {
      const res = await admin.graphql(FILE_NODE, { variables: { id: fileId } });
      const { data: nodeData } = await res.json();
      cdnUrl = nodeData?.node?.image?.url ?? nodeData?.node?.url ?? null;
    } catch {
      /* keep polling */
    }
  }

  if (!cdnUrl) {
    return json({ error: "Image is still processing — try again in a moment." }, { status: 202, headers: CORS_HEADERS });
  }
  return json({ url: cdnUrl }, { headers: CORS_HEADERS });
};

// Remix calls loader for non-POST methods on resource routes — return 405.
export const loader = () =>
  json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
