import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { createHash, createHmac } from "node:crypto";
import { useLoaderData, useFetcher, useRouteError, useNavigate, useBlocker } from "@remix-run/react";
import {
  Page,
  Card,
  Button,
  InlineStack,
  BlockStack,
  Text,
  TextField,
  FormLayout,
  EmptyState,
  Banner,
  Box,
  Divider,
  Badge,
  Checkbox,
  Modal,
  Select,
  Combobox,
  Listbox,
  Tag,
  DropZone,
  Tooltip,
  Icon,
} from "@shopify/polaris";
import { InfoIcon } from "@shopify/polaris-icons";
import { useEffect, useRef, useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { buildPricingConfig, computeConfigVersion } from "../utils/pricingConfig";
import { buildThemeEditorDeepLink } from "../utils/themeEditor";
import { BUILT_IN_TEMPLATES, type TemplateField } from "../utils/templates";
import { resizeRotatedBox, moveBox, cornerPx, type PlacementBox } from "../utils/placementGeometry";

const PRODUCT_QUERY = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      featuredImage {
        url
      }
      media(first: 10) {
        nodes {
          ... on MediaImage {
            image { url }
          }
        }
      }
      variants(first: 50) {
        edges {
          node {
            price
            image { url }
          }
        }
      }
    }
  }
`;

const METAFIELDS_SET_MUTATION = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

// Loads the full draft config (fields, pricing, conditions) for a product.
async function loadDraftConfig(shop: string, productGid: string) {
  return Promise.all([
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
    }),
  ]);
}

// SL-123: "Publish changes" — snapshot the current draft as the customer-facing
// config (stored on ProductConfig.publishedConfig, served by api.preview) AND write
// the pricing metafield the Cart Transform function enforces at checkout. Edits no
// longer sync the metafield; only publishing does. Returns the published version.
async function publishConfig(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  shop: string,
  productGid: string
): Promise<string> {
  const [fields, pricingRules, conditions] = await loadDraftConfig(shop, productGid);
  const config = buildPricingConfig(fields, pricingRules, conditions);
  const version = computeConfigVersion(config);

  // Customer-facing snapshot the storefront (api.preview) renders. Raw rows so both
  // the field-definition (GET) and price-preview (POST) paths can derive from it.
  const snapshot = { fields, pricingRules, conditions };
  await prisma.productConfig.upsert({
    where: { shop_productId: { shop, productId: productGid } },
    update: { publishedConfig: snapshot as object, publishedVersion: version },
    create: { shop, productId: productGid, publishedConfig: snapshot as object, publishedVersion: version },
  });

  // Pricing metafield for the checkout Functions.
  const value = JSON.stringify({ version, shop, ...config });
  try {
    const res = await admin.graphql(METAFIELDS_SET_MUTATION, {
      variables: {
        metafields: [{ ownerId: productGid, namespace: "etch", key: "pricing_rules", type: "json", value }],
      },
    });
    const { data } = await res.json();
    const errs = data?.metafieldsSet?.userErrors ?? [];
    if (errs.length > 0) console.error("[publishConfig] metafield userErrors:", JSON.stringify(errs));
  } catch (err) {
    console.error("[publishConfig] metafield exception:", err);
  }
  return version;
}

type FieldOptionData = {
  id: string;
  label: string;
  priceDelta: number;
  swatchColor?: string | null;
  imageUrl?: string | null;
  previewImageUrl?: string | null;
};

type FieldData = {
  id: string;
  label: string;
  type: string;
  minChars: number | null;
  maxChars: number | null;
  allowedChars: string | null;
  disallowedChars: string | null;
  allowSpaces: boolean;
  countSpaces: boolean;
  required: boolean;
  position: number;
  options: FieldOptionData[];
  helpText?: string | null;
  dateFutureOnly?: boolean;
  fontOptions?: string | null;
  textColorOptions?: string | null;
  fontSizeOptions?: string | null;
  fileAccept?: string | null;
  previewRotation?: number | null;
};

type CharPriceGroupData = {
  id: string;
  label: string;
  characters: string;
  pricePerChar: number;
};

type PricingRuleData = {
  id: string;
  fieldId: string;
  basePrice: number;
  perCharPrice: number;
  mode: string;
  amount: number;
  charGroups: CharPriceGroupData[];
};

const FIELD_TYPE_OPTIONS = [
  { label: "Short text", value: "text" },
  { label: "Paragraph text", value: "textarea" },
  { label: "Number", value: "number" },
  { label: "Date", value: "date" },
  { label: "Dropdown", value: "dropdown" },
  { label: "Buttons", value: "buttons" },
  { label: "Color swatches", value: "swatches" },
  { label: "Image swatches", value: "image-swatches" },
  { label: "Checkbox", value: "checkbox" },
  { label: "File upload", value: "upload" },
  { label: "Text block (display only)", value: "text-block" },
  { label: "Image (display only)", value: "image-static" },
];

// Built-in fonts offered for the per-field font chooser (SL-81, expanded SL-98).
const BUILT_IN_FONTS = [
  // Web-safe (no Google Fonts load needed)
  "Georgia", "Times New Roman", "Arial", "Courier New",
  // Serif
  "Cinzel", "Cormorant Garamond", "EB Garamond", "Lora", "Merriweather", "Playfair Display",
  // Sans-serif
  "Josefin Sans", "Montserrat", "Nunito", "Open Sans", "Oswald", "Poppins", "Raleway", "Roboto",
  // Display / decorative
  "Abril Fatface", "Bebas Neue", "Lobster", "Pacifico", "Righteous",
  // Script / handwriting (personalisation staples)
  "Alex Brush", "Allura", "Caveat", "Dancing Script", "Great Vibes",
  "Kaushan Script", "Pinyon Script", "Sacramento", "Satisfy",
];

// Choice fields present a fixed list of options instead of free text.
const CHOICE_TYPES = ["dropdown", "checkbox", "buttons", "swatches", "image-swatches"];
function isChoiceType(type: string): boolean {
  return CHOICE_TYPES.includes(type);
}

// Coerce any submitted field type to a known value, defaulting to "text".
// Guards against a stale/hand-crafted form posting an unsupported type.
function normalizeFieldType(value: string | null): string {
  return FIELD_TYPE_OPTIONS.some((o) => o.value === value) ? (value as string) : "text";
}

// Parse the JSON options blob posted by the field form into clean rows.
// Drops blank-label rows and coerces price to a number.
function parseOptions(raw: string | null): { label: string; priceDelta: number; swatchColor?: string; imageUrl?: string; previewImageUrl?: string }[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Array<{ label?: unknown; priceDelta?: unknown; swatchColor?: unknown; imageUrl?: unknown; previewImageUrl?: unknown }>;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((o) => ({
        label: typeof o.label === "string" ? o.label.trim() : "",
        priceDelta: Number(o.priceDelta) || 0,
        swatchColor: typeof o.swatchColor === "string" ? o.swatchColor : undefined,
        imageUrl: typeof o.imageUrl === "string" ? o.imageUrl : undefined,
        previewImageUrl: typeof o.previewImageUrl === "string" ? o.previewImageUrl : undefined,
      }))
      .filter((o) => o.label !== "");
  } catch {
    return [];
  }
}

type FieldConditionData = {
  id: string;
  fieldId: string;
  triggerFieldId: string;
  operator: string;
  value: string;
};

function validateField(data: Record<string, string>): string | null {
  if (!data.label?.trim()) return "Label is required.";
  const min = data.minChars ? parseInt(data.minChars) : null;
  const max = data.maxChars ? parseInt(data.maxChars) : null;
  if (min !== null && isNaN(min)) return "Min characters must be a number.";
  if (max !== null && isNaN(max)) return "Max characters must be a number.";
  if (max !== null && max < 1) return "Max characters must be at least 1.";
  if (min !== null && min < 0) return "Min characters cannot be negative.";
  if (min !== null && max !== null && min > max)
    return "Min characters cannot exceed max characters.";
  if (data.allowedChars?.trim() && data.disallowedChars?.trim())
    return "Cannot set both allowed and disallowed characters. Choose one or neither.";
  return null;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const productGid = `gid://shopify/Product/${params.productId}`;

  const [productRes, fields, pricingRules, conditions, config, fontAssets, colorSets, imageAssets, optionSets, merchantTemplates] = await Promise.all([
    admin.graphql(PRODUCT_QUERY, { variables: { id: productGid } }),
    prisma.customizationField.findMany({
      where: { shop: session.shop, productId: productGid },
      orderBy: { position: "asc" },
      include: { options: { orderBy: { position: "asc" } } },
    }),
    prisma.pricingRule.findMany({
      where: { shop: session.shop, productId: productGid },
      include: { charGroups: true },
    }),
    prisma.fieldCondition.findMany({
      where: { shop: session.shop, productId: productGid },
    }),
    prisma.productConfig.findUnique({
      where: { shop_productId: { shop: session.shop, productId: productGid } },
      select: { published: true, previewEnabled: true, publishedVersion: true, publishedConfig: true },
    }),
    prisma.fontAsset.findMany({ where: { shop: session.shop }, orderBy: { name: "asc" }, select: { id: true, name: true, url: true } }),
    prisma.colorSet.findMany({ where: { shop: session.shop }, orderBy: { name: "asc" }, include: { entries: { orderBy: { position: "asc" } } } }),
    prisma.imageAsset.findMany({ where: { shop: session.shop }, orderBy: { name: "asc" }, select: { id: true, name: true, url: true } }),
    prisma.optionSet.findMany({ where: { shop: session.shop }, orderBy: { name: "asc" }, include: { entries: { orderBy: { position: "asc" } } } }),
    prisma.template.findMany({ where: { shop: session.shop }, orderBy: { name: "asc" }, select: { id: true, name: true, payload: true } }),
  ]);

  const { data } = await productRes.json();
  if (!data?.product) {
    throw new Response("Product not found", { status: 404 });
  }

  const variantPrices: number[] = (
    data.product.variants?.edges ?? []
  ).map((e: { node: { price: string } }) => parseFloat(e.node.price));

  // Pricing-only version (audit trail attached to order line items) — deliberately
  // excludes display-only option fields (previewImageUrl/imageUrl/swatchColor) so
  // cosmetic edits don't churn the "why was this priced this way" identifier.
  const liveVersion = computeConfigVersion(buildPricingConfig(fields, pricingRules, conditions));

  // "You have unpublished changes" state and the Publish changes button must catch
  // ANY draft change the snapshot would ship (including cosmetic option fields that
  // liveVersion above ignores) — hash the exact raw shape publishConfig() snapshots.
  const liveContentHash = createHash("sha256")
    .update(JSON.stringify({ fields, pricingRules, conditions }))
    .digest("hex");
  const publishedContentHash = config?.publishedConfig
    ? createHash("sha256").update(JSON.stringify(config.publishedConfig)).digest("hex")
    : null;

  // SL-134: always show a picture if the product has one anywhere — featured image,
  // else any media image, else a variant image.
  const p = data.product as any;
  const firstMediaImage = (p.media?.nodes ?? []).map((n: any) => n?.image?.url).find(Boolean);
  const firstVariantImage = (p.variants?.edges ?? []).map((e: any) => e.node?.image?.url).find(Boolean);
  const productImageUrl: string | null = p.featuredImage?.url ?? firstMediaImage ?? firstVariantImage ?? null;

  return json({
    product: data.product as { id: string; title: string; handle: string },
    shop: session.shop,
    productImageUrl,
    published: config?.published ?? false,
    previewEnabled: config?.previewEnabled ?? false,
    liveVersion,
    publishedVersion: config?.publishedVersion ?? null,
    liveContentHash,
    publishedContentHash,
    fields,
    pricingRules,
    conditions,
    variantPrices,
    assets: { fonts: fontAssets, colorSets, images: imageAssets, optionSets },
    merchantTemplates,
    // One-click theme-editor link to add the Etch widget to the product page.
    // Upgraded to pre-add the app block when the extension UUID is configured. See SL-70.
    themeEditorDeepLink: buildThemeEditorDeepLink({
      shop: session.shop,
      extensionUuid: process.env.SHOPIFY_THEME_APP_EXTENSION_UUID,
    }),
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const _action = form.get("_action") as string;
  const productGid = `gid://shopify/Product/${params.productId}`;
  const shop = session.shop;

  // ── Field actions ──────────────────────────────────────────────────────────

  if (_action === "create") {
    const label = (form.get("label") as string) ?? "";
    const type = normalizeFieldType(form.get("type") as string);
    const minChars = (form.get("minChars") as string) ?? "";
    const maxChars = (form.get("maxChars") as string) ?? "";
    const allowedChars = (form.get("allowedChars") as string) ?? "";
    const disallowedChars = (form.get("disallowedChars") as string) ?? "";
    const allowSpaces = form.get("allowSpaces") !== "false";
    const countSpaces = form.get("countSpaces") === "true";
    const required = form.get("required") === "true";
    const helpText = (form.get("helpText") as string) ?? "";
    const dateFutureOnly = form.get("dateFutureOnly") === "true";
    const fontOptions = (form.get("fontOptions") as string) || null;
    const textColorOptions = (form.get("textColorOptions") as string) || null;
    const fontSizeOptions = (form.get("fontSizeOptions") as string) || null;
    const fileAccept = (form.get("fileAccept") as string) || null;
    const options = isChoiceType(type) ? parseOptions(form.get("options") as string) : [];

    const error = validateField({ label, minChars, maxChars, allowedChars, disallowedChars });
    if (error) return json({ error }, { status: 422 });
    if (isChoiceType(type) && type !== "checkbox" && options.length === 0)
      return json({ error: "Add at least one option." }, { status: 422 });

    const count = await prisma.customizationField.count({
      where: { shop, productId: productGid },
    });
    await prisma.customizationField.create({
      data: {
        shop,
        productId: productGid,
        label: label.trim(),
        type,
        minChars: minChars ? parseInt(minChars) : null,
        maxChars: maxChars ? parseInt(maxChars) : null,
        allowedChars: allowedChars.trim() || null,
        disallowedChars: disallowedChars.trim() || null,
        allowSpaces,
        countSpaces,
        required,
        helpText: helpText.trim() || null,
        dateFutureOnly,
        fontOptions,
        textColorOptions,
        fontSizeOptions,
        fileAccept,
        position: count,
        options: {
          create: options.map((o, i) => ({ label: o.label, priceDelta: o.priceDelta, swatchColor: o.swatchColor ?? null, imageUrl: o.imageUrl ?? null, previewImageUrl: o.previewImageUrl ?? null, position: i })),
        },
      },
    });
    return json({ ok: true });
  }

  if (_action === "update") {
    const fieldId = form.get("fieldId") as string;
    const label = (form.get("label") as string) ?? "";
    const type = normalizeFieldType(form.get("type") as string);
    const minChars = (form.get("minChars") as string) ?? "";
    const maxChars = (form.get("maxChars") as string) ?? "";
    const allowedChars = (form.get("allowedChars") as string) ?? "";
    const disallowedChars = (form.get("disallowedChars") as string) ?? "";
    const allowSpaces = form.get("allowSpaces") !== "false";
    const countSpaces = form.get("countSpaces") === "true";
    const required = form.get("required") === "true";
    const helpText = (form.get("helpText") as string) ?? "";
    const dateFutureOnly = form.get("dateFutureOnly") === "true";
    const fontOptions = (form.get("fontOptions") as string) || null;
    const textColorOptions = (form.get("textColorOptions") as string) || null;
    const fontSizeOptions = (form.get("fontSizeOptions") as string) || null;
    const fileAccept = (form.get("fileAccept") as string) || null;
    const options = isChoiceType(type) ? parseOptions(form.get("options") as string) : [];

    const error = validateField({ label, minChars, maxChars, allowedChars, disallowedChars });
    if (error) return json({ error }, { status: 422 });
    if (isChoiceType(type) && type !== "checkbox" && options.length === 0)
      return json({ error: "Add at least one option." }, { status: 422 });

    const updated = await prisma.customizationField.updateMany({
      where: { id: fieldId, shop },
      data: {
        label: label.trim(),
        type,
        minChars: minChars ? parseInt(minChars) : null,
        maxChars: maxChars ? parseInt(maxChars) : null,
        allowedChars: allowedChars.trim() || null,
        disallowedChars: disallowedChars.trim() || null,
        allowSpaces,
        countSpaces,
        required,
        helpText: helpText.trim() || null,
        dateFutureOnly,
        fontOptions,
        textColorOptions,
        fontSizeOptions,
        fileAccept,
      },
    });
    // Only touch options if the field is actually owned by this shop.
    if (updated.count > 0) {
      // Replace the option set. Also clears options when switching away from a choice type.
      await prisma.fieldOption.deleteMany({ where: { fieldId, field: { shop } } });
      if (options.length > 0) {
        await prisma.fieldOption.createMany({
          data: options.map((o, i) => ({ fieldId, label: o.label, priceDelta: o.priceDelta, swatchColor: o.swatchColor ?? null, imageUrl: o.imageUrl ?? null, previewImageUrl: o.previewImageUrl ?? null, position: i })),
        });
      }
    }
    return json({ ok: true });
  }

  if (_action === "delete") {
    const fieldId = form.get("fieldId") as string;
    await prisma.customizationField.deleteMany({ where: { id: fieldId, shop } });
    // Clean up any conditions that reference the deleted field (as dependent or trigger).
    await prisma.fieldCondition.deleteMany({
      where: { shop, productId: productGid, OR: [{ fieldId }, { triggerFieldId: fieldId }] },
    });
    const remaining = await prisma.customizationField.findMany({
      where: { shop, productId: productGid },
      orderBy: { position: "asc" },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].position !== i) {
        await prisma.customizationField.update({
          where: { id: remaining[i].id },
          data: { position: i },
        });
      }
    }
    return json({ ok: true });
  }

  if (_action === "move_up" || _action === "move_down") {
    const fieldId = form.get("fieldId") as string;
    const fields = await prisma.customizationField.findMany({
      where: { shop, productId: productGid },
      orderBy: { position: "asc" },
    });
    const idx = fields.findIndex((f) => f.id === fieldId);
    if (idx === -1) return json({ ok: true });
    const swapIdx = _action === "move_up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= fields.length) return json({ ok: true });
    await prisma.$transaction([
      prisma.customizationField.update({
        where: { id: fields[idx].id },
        data: { position: swapIdx },
      }),
      prisma.customizationField.update({
        where: { id: fields[swapIdx].id },
        data: { position: idx },
      }),
    ]);
    return json({ ok: true });
  }

  // ── Pricing actions ────────────────────────────────────────────────────────

  if (_action === "set_field_price") {
    const fieldId = form.get("fieldId") as string;
    const mode = (form.get("mode") as string) || "per_char";
    const perCharPrice = parseFloat((form.get("perCharPrice") as string) || "0") || 0;
    const amount = parseFloat((form.get("amount") as string) || "0") || 0;
    await prisma.pricingRule.upsert({
      where: { shop_productId_fieldId: { shop, productId: productGid, fieldId } },
      update: { perCharPrice, mode, amount },
      create: { shop, productId: productGid, fieldId, perCharPrice, mode, amount },
    });
    return json({ ok: true });
  }

  if (_action === "add_char_group") {
    const fieldId = form.get("fieldId") as string;
    const label = ((form.get("groupLabel") as string) ?? "").trim();
    const characters = ((form.get("groupChars") as string) ?? "").trim();
    const pricePerChar = parseFloat((form.get("groupPrice") as string) || "0") || 0;

    if (!label) return json({ error: "Group name is required." }, { status: 422 });
    if (!characters) return json({ error: "Characters are required." }, { status: 422 });

    const rule = await prisma.pricingRule.upsert({
      where: { shop_productId_fieldId: { shop, productId: productGid, fieldId } },
      update: {},
      create: { shop, productId: productGid, fieldId },
    });
    await prisma.charPriceGroup.create({
      data: { pricingRuleId: rule.id, label, characters, pricePerChar },
    });
    return json({ ok: true });
  }

  // Active/Inactive toggle (SL-123). Activating also publishes the current draft so
  // the storefront is never "active but showing nothing/stale".
  if (_action === "set_published") {
    const published = form.get("published") === "true";
    await prisma.productConfig.upsert({
      where: { shop_productId: { shop, productId: productGid } },
      update: { published },
      create: { shop, productId: productGid, published },
    });
    if (published) await publishConfig(admin, shop, productGid);
    return json({ ok: true });
  }

  // "Publish changes" — push the current draft to the storefront + checkout (SL-123).
  if (_action === "publish_changes") {
    await publishConfig(admin, shop, productGid);
    return json({ ok: true });
  }

  if (_action === "toggle_preview") {
    const previewEnabled = form.get("previewEnabled") === "true";
    await prisma.productConfig.upsert({
      where: { shop_productId: { shop, productId: productGid } },
      update: { previewEnabled },
      create: { shop, productId: productGid, previewEnabled },
    });
    return json({ ok: true });
  }

  if (_action === "generate_preview_token") {
    const secret = process.env.SHOPIFY_API_SECRET;
    if (!secret) return json({ error: "Not configured" }, { status: 500 });
    const numericId = params.productId!;
    const expiry = Date.now() + 30 * 60 * 1000;
    const hmac = createHmac("sha256", secret).update(`${shop}:${numericId}:${expiry}`).digest("hex");
    return json({ token: `${expiry}.${hmac}` });
  }

  if (_action === "save_preview_placement") {
    const fieldId = form.get("fieldId") as string;
    if (!fieldId) return json({ ok: false }, { status: 400 });
    await prisma.customizationField.updateMany({
      where: { id: fieldId, shop },
      data: {
        previewX: parseFloat(form.get("previewX") as string),
        previewY: parseFloat(form.get("previewY") as string),
        previewW: parseFloat(form.get("previewW") as string),
        previewH: parseFloat(form.get("previewH") as string),
        previewRotation: parseFloat(form.get("previewRotation") as string) || 0,
      },
    });
    return json({ ok: true });
  }

  if (_action === "delete_char_group") {
    const groupId = form.get("groupId") as string;
    // Verify shop ownership via the parent rule before deleting
    const group = await prisma.charPriceGroup.findFirst({
      where: { id: groupId, rule: { shop } },
    });
    if (group) await prisma.charPriceGroup.delete({ where: { id: groupId } });
    return json({ ok: true });
  }

  if (_action === "add_field_condition") {
    const fieldId = form.get("fieldId") as string;
    const triggerFieldId = form.get("triggerFieldId") as string;
    const value = ((form.get("conditionValue") as string) ?? "").trim();
    if (!fieldId || !triggerFieldId) return json({ error: "fieldId and triggerFieldId required." }, { status: 422 });
    if (fieldId === triggerFieldId) return json({ error: "A field cannot be its own trigger." }, { status: 422 });
    if (!value) return json({ error: "Condition value is required." }, { status: 422 });
    await prisma.fieldCondition.create({
      data: { shop, productId: productGid, fieldId, triggerFieldId, operator: "equals", value },
    });
    return json({ ok: true });
  }

  if (_action === "delete_field_condition") {
    const conditionId = form.get("conditionId") as string;
    await prisma.fieldCondition.deleteMany({ where: { id: conditionId, shop } });
    return json({ ok: true });
  }

  // ── Template actions ───────────────────────────────────────────────────────

  if (_action === "apply_template") {
    const payloadRaw = form.get("payload") as string;
    let templateFields: TemplateField[];
    try {
      templateFields = JSON.parse(payloadRaw) as TemplateField[];
    } catch {
      return json({ error: "Invalid template payload." }, { status: 422 });
    }
    const existingCount = await prisma.customizationField.count({ where: { shop, productId: productGid } });
    for (let i = 0; i < templateFields.length; i++) {
      const f = templateFields[i];
      const created = await prisma.customizationField.create({
        data: {
          shop, productId: productGid, label: f.label, type: f.type,
          required: f.required, minChars: f.minChars, maxChars: f.maxChars,
          allowedChars: f.allowedChars, disallowedChars: f.disallowedChars,
          allowSpaces: f.allowSpaces, countSpaces: f.countSpaces,
          helpText: f.helpText, dateFutureOnly: f.dateFutureOnly,
          fontOptions: f.fontOptions, textColorOptions: f.textColorOptions, fontSizeOptions: f.fontSizeOptions,
          fileAccept: f.fileAccept, position: existingCount + i,
        },
      });
      if (f.options.length > 0) {
        await prisma.fieldOption.createMany({
          data: f.options.map((o, j) => ({
            fieldId: created.id, label: o.label, priceDelta: o.priceDelta,
            swatchColor: o.swatchColor ?? null, imageUrl: o.imageUrl ?? null, previewImageUrl: o.previewImageUrl ?? null, position: j,
          })),
        });
      }
    }
    return json({ ok: true });
  }

  if (_action === "save_as_template") {
    const name = ((form.get("templateName") as string) ?? "").trim();
    if (!name) return json({ error: "Template name is required." }, { status: 422 });
    const currentFields = await prisma.customizationField.findMany({
      where: { shop, productId: productGid },
      orderBy: { position: "asc" },
      include: { options: { orderBy: { position: "asc" } } },
    });
    if (currentFields.length === 0) return json({ error: "No fields to save." }, { status: 422 });
    const payload: TemplateField[] = currentFields.map((f) => ({
      label: f.label, type: f.type, required: f.required,
      minChars: f.minChars, maxChars: f.maxChars,
      allowedChars: f.allowedChars, disallowedChars: f.disallowedChars,
      allowSpaces: f.allowSpaces, countSpaces: f.countSpaces,
      helpText: f.helpText, dateFutureOnly: f.dateFutureOnly,
      fontOptions: f.fontOptions, textColorOptions: f.textColorOptions,
      fontSizeOptions: f.fontSizeOptions ?? null,
      fileAccept: f.fileAccept,
      options: f.options.map((o) => ({
        label: o.label, priceDelta: o.priceDelta,
        swatchColor: o.swatchColor ?? undefined, imageUrl: o.imageUrl ?? undefined, previewImageUrl: o.previewImageUrl ?? undefined,
      })),
    }));
    await prisma.template.create({ data: { shop, name, payload: JSON.stringify(payload) } });
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

// ── Field components ──────────────────────────────────────────────────────────

type AssetLibrary = {
  fonts: { id: string; name: string; url: string }[];
  colorSets: { id: string; name: string; entries: { id: string; label: string; color: string; position: number }[] }[];
  images: { id: string; name: string; url: string }[];
  optionSets: { id: string; name: string; entries: { id: string; label: string; priceDelta: number; position: number }[] }[];
};

const TYPE_PICKER_OPTIONS = [
  { value: "text",           label: "Short text",          description: "Single line — names, initials, short messages" },
  { value: "textarea",       label: "Long text",            description: "Multi-line — longer messages or paragraphs" },
  { value: "number",         label: "Number",               description: "Numeric input with optional min / max" },
  { value: "date",           label: "Date",                 description: "Date picker, optionally future dates only" },
  { value: "dropdown",       label: "Dropdown",             description: "Single selection from a list" },
  { value: "checkbox",       label: "Checkbox",             description: "Single opt-in with optional surcharge" },
  { value: "buttons",        label: "Button group",         description: "Single selection shown as clickable buttons" },
  { value: "swatches",       label: "Color swatches",       description: "Single selection shown as colored circles" },
  { value: "image-swatches", label: "Image swatches",       description: "Single selection shown as images" },
  { value: "upload",         label: "File upload",          description: "Let customers attach a file (image, PDF, etc.)" },
  { value: "text-block",     label: "Text block",           description: "Display-only text — no input, no pricing" },
  { value: "image-static",   label: "Image (display only)", description: "Display-only image — no input, no pricing" },
];

function TypePickerModal({ open, onSelect, onCancel }: { open: boolean; onSelect: (type: string) => void; onCancel: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title="Choose a field type" noScroll={false}>
      <Modal.Section>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          {TYPE_PICKER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              style={{
                textAlign: "left",
                padding: "12px 14px",
                border: "1px solid #e1e3e5",
                borderRadius: "8px",
                background: "#fff",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#005bd3";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 1px #005bd3";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#e1e3e5";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
              }}
            >
              <Text as="p" fontWeight="semibold" variant="bodySm">{opt.label}</Text>
              <Text as="p" tone="subdued" variant="bodySm">{opt.description}</Text>
            </button>
          ))}
        </div>
      </Modal.Section>
    </Modal>
  );
}

// Reusable image input (SL-120): drag-and-drop, a click-to-browse "Upload a file"
// link (opens the native OS/photo picker on desktop and mobile), OR a pasted URL.
// Uploads go through the existing /api/upload (Shopify staged upload → CDN URL) and
// resolve to the same string a pasted URL would, so callers store one value.
function ImageUploadField({
  value,
  onChange,
  label = "Image",
  helpText,
  compact = false,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  helpText?: string;
  compact?: boolean;
}) {
  const { shop } = useLoaderData<typeof loader>();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleDrop = useCallback(
    async (_: File[], accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { setUploadError("File too large (max 10 MB)"); return; }
      setUploadError(null);
      setUploading(true);
      try {
        // Native fetch sends real multipart/form-data (browser sets the boundary and
        // preserves the File's name/size). fetcher.submit would urlencode it and the
        // server would see an empty file — the SL-121 502 bug.
        const fd = new FormData();
        fd.append("shop", shop);
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
        const data = isJson ? await res.json() : null;
        if (res.ok && data?.url) {
          onChange(data.url);
        } else {
          setUploadError(data?.error ?? "Upload failed — please try again, or paste an image URL.");
        }
      } catch {
        setUploadError("Upload failed — check your connection, or paste an image URL.");
      } finally {
        setUploading(false);
      }
    },
    [shop, onChange]
  );

  return (
    <BlockStack gap="200">
      {uploadError && <Banner tone="critical" onDismiss={() => setUploadError(null)}>{uploadError}</Banner>}
      <DropZone accept="image/*" type="image" allowMultiple={false} onDrop={handleDrop} disabled={uploading}>
        {uploading ? (
          <Box padding="400">
            <Text as="p" alignment="center" tone="subdued">Uploading…</Text>
          </Box>
        ) : (
          <DropZone.FileUpload
            actionTitle="Upload a file"
            actionHint={compact ? "or drop an image" : "or drop a JPEG, PNG, WebP, or GIF (max 10 MB)"}
          />
        )}
      </DropZone>
      <InlineStack gap="200" blockAlign="end" wrap={false}>
        <Box width="100%">
          <TextField
            label={`${label} URL`}
            labelHidden={compact}
            value={value}
            onChange={onChange}
            autoComplete="off"
            placeholder="https://… (or upload above)"
            helpText={compact ? undefined : (helpText ?? "Upload a file, or paste an image URL.")}
          />
        </Box>
        {/* SL-139: clearing used to mean clicking into the URL field and backspacing
            the whole value out — a one-click way to remove it instead. */}
        {value && (
          <Button variant="plain" tone="critical" size="micro" onClick={() => onChange("")}>
            Remove image
          </Button>
        )}
      </InlineStack>
      {value && !compact && (
        <img src={value} alt="preview" style={{ maxWidth: "8rem", maxHeight: "8rem", objectFit: "cover", borderRadius: "6px", border: "1px solid #ddd" }} />
      )}
    </BlockStack>
  );
}

// Small hover "i" that explains a field in plain language (SL-124). Clicking it does
// not toggle/submit the field it labels.
function InfoTip({ content }: { content: string }) {
  return (
    <Tooltip content={content} dismissOnMouseOut>
      <span
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        style={{ display: "inline-flex", verticalAlign: "middle", cursor: "help" }}
      >
        <Icon source={InfoIcon} tone="subdued" />
      </span>
    </Tooltip>
  );
}

// A field label followed by an InfoTip — usable as the `label` of a TextField/Checkbox.
function LabelWithInfo({ text, info }: { text: string; info: string }) {
  return (
    <InlineStack gap="100" blockAlign="center">
      <Text as="span" variant="bodyMd">{text}</Text>
      <InfoTip content={info} />
    </InlineStack>
  );
}

function FieldForm({
  field,
  actionType,
  onClose,
  onDirtyChange,
  assets,
  initialType,
}: {
  field?: FieldData;
  actionType: "create" | "update";
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  assets?: AssetLibrary;
  initialType?: string;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [label, setLabel] = useState(field?.label ?? "");
  const [type, setType] = useState(field?.type ?? initialType ?? "text");
  const [minChars, setMinChars] = useState(field?.minChars?.toString() ?? "");
  const [maxChars, setMaxChars] = useState(field?.maxChars?.toString() ?? "");
  const [allowedChars, setAllowedChars] = useState(field?.allowedChars ?? "");
  const [disallowedChars, setDisallowedChars] = useState(field?.disallowedChars ?? "");
  const [allowSpaces, setAllowSpaces] = useState(field?.allowSpaces ?? true);
  const [countSpaces, setCountSpaces] = useState(field?.countSpaces ?? false);
  const [required, setRequired] = useState(field?.required ?? false);
  const [helpText, setHelpText] = useState(field?.helpText ?? "");
  const [dateFutureOnly, setDateFutureOnly] = useState(field?.dateFutureOnly ?? false);
  const [fileAccept, setFileAccept] = useState(field?.fileAccept ?? "*/*");
  // Font chooser (SL-81, SL-98) — stored as JSON array of font names on the field.
  const initialFonts: string[] = field?.fontOptions ? (JSON.parse(field.fontOptions) as string[]) : [];
  const [enableFonts, setEnableFonts] = useState(initialFonts.length > 0);
  const [selectedFonts, setSelectedFonts] = useState<string[]>(initialFonts);
  const [fontSearch, setFontSearch] = useState("");
  const toggleFont = (f: string) =>
    setSelectedFonts((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]);
  // Text color chooser (SL-82) — stored as JSON array of {label, color}.
  const initialColors: { label: string; color: string }[] =
    field?.textColorOptions ? (JSON.parse(field.textColorOptions) as { label: string; color: string }[]) : [];
  const [enableColors, setEnableColors] = useState(initialColors.length > 0);
  const [textColors, setTextColors] = useState<{ label: string; color: string }[]>(initialColors);
  const addColor = () => setTextColors((prev) => [...prev, { label: "", color: "#000000" }]);
  const removeColor = (i: number) => setTextColors((prev) => prev.filter((_, idx) => idx !== i));
  const updateColor = (i: number, key: "label" | "color", val: string) =>
    setTextColors((prev) => prev.map((c, idx) => (idx === i ? { ...c, [key]: val } : c)));
  // Choice-field options — extend with imageUrl for image-swatches.
  const initialOptions = (field?.options ?? []).map((o) => ({
    label: o.label,
    priceDelta: String(o.priceDelta),
    swatchColor: o.swatchColor ?? "#000000",
    imageUrl: o.imageUrl ?? "",
    previewImageUrl: (o as any).previewImageUrl ?? "",
  }));
  const [options, setOptions] = useState<{ label: string; priceDelta: string; swatchColor: string; imageUrl: string; previewImageUrl: string }[]>(initialOptions);
  const initialCheckboxPrice = field?.options?.[0] ? String(field.options[0].priceDelta) : "";
  const [checkboxPrice, setCheckboxPrice] = useState(initialCheckboxPrice);

  const listChoice = type === "dropdown" || type === "buttons" || type === "swatches" || type === "image-swatches";
  const isCheckbox = type === "checkbox";
  const isNumber = type === "number";
  const isDate = type === "date";
  const isUpload = type === "upload";
  const isDisplay = type === "text-block" || type === "image-static";
  const isText = type === "text" || type === "textarea";
  const choice = isChoiceType(type);
  const optionsPayload = isCheckbox ? [{ label: "Yes", priceDelta: checkboxPrice }] : options;
  const addOption = () => setOptions((prev) => [...prev, { label: "", priceDelta: "", swatchColor: "#000000", imageUrl: "", previewImageUrl: "" }]);
  const removeOption = (i: number) => setOptions((prev) => prev.filter((_, idx) => idx !== i));
  const updateOption = (i: number, key: "label" | "priceDelta" | "swatchColor" | "imageUrl" | "previewImageUrl", val: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, [key]: val } : o)));

  // SL-137: most merchants never set a per-option preview image — start each
  // option's uploader collapsed to a small button unless it already has one set.
  const [expandedPreviewImage, setExpandedPreviewImage] = useState<Record<number, boolean>>({});

  // Font size options (SL-97) — stored as JSON string[] e.g. ["12px","16px","24px"]
  const initialSizes: string[] = field?.fontSizeOptions ? (JSON.parse(field.fontSizeOptions) as string[]) : [];
  const [enableSizes, setEnableSizes] = useState(initialSizes.length > 0);
  const [fontSizes, setFontSizes] = useState<string[]>(initialSizes.length > 0 ? initialSizes : ["12px", "16px", "24px"]);
  const addSize = () => setFontSizes((prev) => [...prev, ""]);
  const removeSize = (i: number) => setFontSizes((prev) => prev.filter((_, idx) => idx !== i));
  const updateSize = (i: number, val: string) => setFontSizes((prev) => prev.map((s, idx) => idx === i ? val : s));

  // Computed hidden values for SL-81 and SL-82.
  const fontOptionsValue = enableFonts && selectedFonts.length > 0 ? JSON.stringify(selectedFonts) : "";
  const textColorOptionsValue = enableColors && textColors.length > 0 ? JSON.stringify(textColors) : "";
  const fontSizeOptionsValue = enableSizes && fontSizes.filter(Boolean).length > 0 ? JSON.stringify(fontSizes.filter(Boolean)) : "";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const dirty =
    label !== (field?.label ?? "") ||
    type !== (field?.type ?? "text") ||
    minChars !== (field?.minChars?.toString() ?? "") ||
    maxChars !== (field?.maxChars?.toString() ?? "") ||
    allowedChars !== (field?.allowedChars ?? "") ||
    disallowedChars !== (field?.disallowedChars ?? "") ||
    allowSpaces !== (field?.allowSpaces ?? true) ||
    countSpaces !== (field?.countSpaces ?? false) ||
    required !== (field?.required ?? false) ||
    helpText !== (field?.helpText ?? "") ||
    dateFutureOnly !== (field?.dateFutureOnly ?? false) ||
    fileAccept !== (field?.fileAccept ?? "*/*") ||
    fontOptionsValue !== (field?.fontOptions ?? "") ||
    textColorOptionsValue !== (field?.textColorOptions ?? "") ||
    fontSizeOptionsValue !== (field?.fontSizeOptions ?? "") ||
    checkboxPrice !== initialCheckboxPrice ||
    JSON.stringify(options) !== JSON.stringify(initialOptions);
  useEffect(() => { onDirtyChangeRef.current?.(dirty); }, [dirty]);
  useEffect(() => () => onDirtyChangeRef.current?.(false), []);

  // Inject Google Fonts for tag previews (SL-98)
  useEffect(() => {
    const googleFonts = selectedFonts.filter(
      (f) => !["Georgia", "Times New Roman", "Arial", "Courier New"].includes(f)
    );
    if (!googleFonts.length) return;
    const id = "etch-admin-google-fonts";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${googleFonts.map((f) => `family=${f.replace(/ /g, "+")}`).join("&")}&display=swap`;
  }, [selectedFonts]);

  return (
    <fetcher.Form method="post">
      <BlockStack gap="400">
        <input type="hidden" name="_action" value={actionType} />
        {field && <input type="hidden" name="fieldId" value={field.id} />}
        <input type="hidden" name="label" value={label} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="minChars" value={minChars} />
        <input type="hidden" name="maxChars" value={maxChars} />
        <input type="hidden" name="allowedChars" value={allowedChars} />
        <input type="hidden" name="disallowedChars" value={disallowedChars} />
        <input type="hidden" name="allowSpaces" value={String(allowSpaces)} />
        <input type="hidden" name="countSpaces" value={String(countSpaces)} />
        <input type="hidden" name="required" value={String(required)} />
        <input type="hidden" name="helpText" value={helpText} />
        <input type="hidden" name="dateFutureOnly" value={String(dateFutureOnly)} />
        <input type="hidden" name="fileAccept" value={fileAccept} />
        <input type="hidden" name="fontOptions" value={fontOptionsValue} />
        <input type="hidden" name="textColorOptions" value={textColorOptionsValue} />
        <input type="hidden" name="fontSizeOptions" value={fontSizeOptionsValue} />
        <input type="hidden" name="options" value={JSON.stringify(optionsPayload)} />
        {fetcher.data?.error && <Banner tone="critical">{fetcher.data.error}</Banner>}
        <FormLayout>
          <TextField label="Label" value={label} onChange={setLabel} autoComplete="off" requiredIndicator />
          <Select
            label="Field type"
            options={FIELD_TYPE_OPTIONS}
            value={type}
            onChange={setType}
            helpText="Choose how shoppers interact with this field."
          />

          {/* ── Display-only elements (SL-79; image upload SL-120) ────────── */}
          {isDisplay && type === "text-block" && (
            <TextField
              label="Content"
              helpText="This text appears as instructions in your form."
              value={helpText}
              onChange={setHelpText}
              multiline={3}
              autoComplete="off"
            />
          )}
          {isDisplay && type === "image-static" && (
            <ImageUploadField
              label="Image"
              value={helpText}
              onChange={setHelpText}
              helpText="Upload an image to display (e.g. a sizing guide), or paste an image URL."
            />
          )}

          {/* ── Number field (SL-80) ──────────────────────────────────────── */}
          {isNumber && (
            <>
              <FormLayout.Group>
                <TextField label="Minimum value" type="number" value={minChars} onChange={setMinChars} autoComplete="off" helpText="Leave blank for no minimum" />
                <TextField label="Maximum value" type="number" value={maxChars} onChange={setMaxChars} autoComplete="off" helpText="Leave blank for no maximum" />
              </FormLayout.Group>
              <Checkbox label="Required" helpText="Shopper must enter a number before adding to cart" checked={required} onChange={setRequired} />
            </>
          )}

          {/* ── Date field (SL-80) ────────────────────────────────────────── */}
          {isDate && (
            <>
              <Checkbox label="Future dates only" helpText="Reject dates in the past" checked={dateFutureOnly} onChange={setDateFutureOnly} />
              <Checkbox label="Required" helpText="Shopper must choose a date before adding to cart" checked={required} onChange={setRequired} />
            </>
          )}

          {/* ── Upload field (SL-78) ──────────────────────────────────────── */}
          {isUpload && (
            <>
              <Select
                label="Accepted file types"
                options={[
                  { label: "Any file", value: "*/*" },
                  { label: "Images only", value: "image/*" },
                  { label: "PDF only", value: "application/pdf" },
                  { label: "Images or PDF", value: "image/*,.pdf" },
                ]}
                value={fileAccept}
                onChange={setFileAccept}
              />
              <Checkbox label="Required" helpText="Shopper must upload a file before adding to cart" checked={required} onChange={setRequired} />
            </>
          )}

          {/* ── Choice fields with option list ────────────────────────────── */}
          {listChoice && (
            <>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodyMd">Options</Text>
                  {assets && type !== "image-swatches" && type !== "swatches" && assets.optionSets.length > 0 && (
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodySm" tone="subdued">Load from library:</Text>
                      <select
                        onChange={(e) => {
                          const os = assets.optionSets.find((s) => s.id === e.target.value);
                          if (os) setOptions(os.entries.map((en) => ({ label: en.label, priceDelta: String(en.priceDelta), swatchColor: "#000000", imageUrl: "", previewImageUrl: "" })));
                          e.target.value = "";
                        }}
                        style={{ fontSize: "0.8125rem" }}
                        defaultValue=""
                      >
                        <option value="" disabled>Choose an option set…</option>
                        {assets.optionSets.map((os) => <option key={os.id} value={os.id}>{os.name}</option>)}
                      </select>
                    </InlineStack>
                  )}
                  {assets && type === "swatches" && assets.colorSets.length > 0 && (
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodySm" tone="subdued">Load from library:</Text>
                      <select
                        onChange={(e) => {
                          const cs = assets.colorSets.find((s) => s.id === e.target.value);
                          if (cs) setOptions(cs.entries.map((en) => ({ label: en.label, priceDelta: "0", swatchColor: en.color, imageUrl: "", previewImageUrl: "" })));
                          e.target.value = "";
                        }}
                        style={{ fontSize: "0.8125rem" }}
                        defaultValue=""
                      >
                        <option value="" disabled>Choose a color set…</option>
                        {assets.colorSets.map((cs) => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
                      </select>
                    </InlineStack>
                  )}
                  {assets && type === "image-swatches" && assets.images.length > 0 && (
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodySm" tone="subdued">Load from library:</Text>
                      <select
                        onChange={(e) => {
                          const img = assets.images.find((im) => im.id === e.target.value);
                          if (img) setOptions((prev) => [...prev, { label: img.name, priceDelta: "0", swatchColor: "#000000", imageUrl: img.url, previewImageUrl: "" }]);
                          e.target.value = "";
                        }}
                        style={{ fontSize: "0.8125rem" }}
                        defaultValue=""
                      >
                        <option value="" disabled>Add image from library…</option>
                        {assets.images.map((im) => <option key={im.id} value={im.id}>{im.name}</option>)}
                      </select>
                    </InlineStack>
                  )}
                </InlineStack>
                {options.map((opt, i) => (
                  <BlockStack key={i} gap="150">
                  <InlineStack gap="200" blockAlign="end" wrap={false}>
                    {type === "swatches" && (
                      <input
                        type="color"
                        value={opt.swatchColor || "#000000"}
                        onChange={(e) => updateOption(i, "swatchColor", e.target.value)}
                        aria-label="Swatch color"
                        style={{ width: "2.25rem", height: "2.25rem", padding: "2px", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer", flexShrink: 0 }}
                      />
                    )}
                    {type === "image-swatches" && (
                      <div style={{ flex: 2 }}>
                        <ImageUploadField
                          compact
                          label="Image"
                          value={opt.imageUrl}
                          onChange={(v) => updateOption(i, "imageUrl", v)}
                        />
                      </div>
                    )}
                    <div style={{ flex: 2 }}>
                      <TextField
                        label="Choice"
                        labelHidden
                        placeholder={type === "swatches" ? "e.g. Gold" : type === "image-swatches" ? "e.g. Floral" : "e.g. 18 inch"}
                        value={opt.label}
                        onChange={(v) => updateOption(i, "label", v)}
                        autoComplete="off"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Extra price"
                        labelHidden
                        type="number"
                        prefix="$"
                        placeholder="0.00"
                        value={opt.priceDelta}
                        onChange={(v) => updateOption(i, "priceDelta", v)}
                        autoComplete="off"
                      />
                    </div>
                    <Button onClick={() => removeOption(i)} accessibilityLabel="Remove option">Remove</Button>
                  </InlineStack>
                  {/* SL-135: image shown in the live preview when this option is selected.
                      SL-137: collapsed to a small button by default — most merchants don't
                      set one per option, so a full dropzone on every row wastes space. An
                      explicit expandedPreviewImage[i] (true/false) overrides the previewImageUrl
                      default so an already-set image can still be collapsed away. */}
                  <Box paddingInlineStart="200">
                    {expandedPreviewImage[i] ?? !!opt.previewImageUrl ? (
                      <BlockStack gap="050">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="span" variant="bodySm" tone="subdued">Preview image when selected (optional)</Text>
                          <Button
                            variant="plain"
                            size="micro"
                            onClick={() => setExpandedPreviewImage((prev) => ({ ...prev, [i]: false }))}
                          >
                            - Hide preview
                          </Button>
                        </InlineStack>
                        <ImageUploadField compact label="Preview" value={opt.previewImageUrl} onChange={(v) => updateOption(i, "previewImageUrl", v)} />
                      </BlockStack>
                    ) : (
                      <Button
                        variant="plain"
                        size="micro"
                        onClick={() => setExpandedPreviewImage((prev) => ({ ...prev, [i]: true }))}
                      >
                        + Add preview image
                      </Button>
                    )}
                  </Box>
                  </BlockStack>
                ))}
                <div><Button onClick={addOption}>Add option</Button></div>
              </BlockStack>
              <Checkbox label="Required" helpText="Shoppers must choose an option before adding to cart" checked={required} onChange={setRequired} />
            </>
          )}

          {/* ── Checkbox field ────────────────────────────────────────────── */}
          {isCheckbox && (
            <>
              <TextField
                label="Extra price when checked"
                type="number"
                prefix="$"
                placeholder="0.00"
                helpText="Added to the price when the shopper ticks this box. Leave blank for a free option."
                value={checkboxPrice}
                onChange={setCheckboxPrice}
                autoComplete="off"
              />
              <Checkbox label="Required" helpText="Shopper must tick this box before adding to cart (e.g. to accept terms)" checked={required} onChange={setRequired} />
            </>
          )}

          {/* ── Text / paragraph field ────────────────────────────────────── */}
          {isText && (
            <>
              <FormLayout.Group>
                <TextField label={<LabelWithInfo text="Min characters" info="The fewest characters a shopper must type in this field. Leave blank for no minimum." />} type="number" value={minChars} onChange={setMinChars} autoComplete="off" />
                <TextField label={<LabelWithInfo text="Max characters" info="The most characters a shopper can type in this field. Leave blank for no maximum." />} type="number" value={maxChars} onChange={setMaxChars} autoComplete="off" />
              </FormLayout.Group>
              <FormLayout.Group>
                <TextField label={<LabelWithInfo text="Allowed characters" info="Only these characters will be accepted. Leave blank to allow all characters." />} value={allowedChars} onChange={setAllowedChars} autoComplete="off" />
                <TextField label={<LabelWithInfo text="Disallowed characters" info="These characters will be rejected. Leave blank to allow all characters." />} value={disallowedChars} onChange={setDisallowedChars} autoComplete="off" />
              </FormLayout.Group>
              <FormLayout.Group>
                <Checkbox label={<LabelWithInfo text="Block spaces" info="Check this box if you don't want to allow spaces in this text field." />} checked={!allowSpaces} onChange={(v) => setAllowSpaces(!v)} />
                <Checkbox label={<LabelWithInfo text="Count spaces toward price" info="When off, spaces don't count toward the per-character price the shopper is charged." />} checked={countSpaces} onChange={setCountSpaces} />
              </FormLayout.Group>
              {/* Font chooser (SL-81, searchable SL-98) */}
              <Checkbox
                label="Let shoppers choose a font"
                helpText="Show a font picker beside this field"
                checked={enableFonts}
                onChange={(v) => { setEnableFonts(v); if (!v) setSelectedFonts([]); }}
              />
              {enableFonts && (
                <BlockStack gap="200">
                  <Combobox
                    activator={
                      <Combobox.TextField
                        label="Add fonts"
                        labelHidden
                        value={fontSearch}
                        onChange={setFontSearch}
                        placeholder="Search fonts…"
                        autoComplete="off"
                      />
                    }
                  >
                    {(() => {
                      const q = fontSearch.toLowerCase();
                      const allFonts = [
                        ...BUILT_IN_FONTS,
                        ...(assets?.fonts.map((f) => f.name) ?? []),
                      ].filter((f, i, arr) => arr.indexOf(f) === i);
                      const opts = allFonts.filter(
                        (f) => !selectedFonts.includes(f) && (!q || f.toLowerCase().includes(q))
                      );
                      return opts.length > 0 ? (
                        <Listbox onSelect={(v) => { toggleFont(v); setFontSearch(""); }}>
                          {opts.map((f) => (
                            <Listbox.Option key={f} value={f}>{f}</Listbox.Option>
                          ))}
                        </Listbox>
                      ) : null;
                    })()}
                  </Combobox>
                  {selectedFonts.length > 0 && (
                    <InlineStack gap="200" wrap>
                      {selectedFonts.map((f) => (
                        <Tag key={f} onRemove={() => toggleFont(f)}>
                          <span style={{ fontFamily: `'${f}', serif` }}>{f}</span>
                        </Tag>
                      ))}
                    </InlineStack>
                  )}
                </BlockStack>
              )}
              {/* Text color chooser (SL-82) */}
              <Checkbox
                label="Let shoppers choose a text color"
                helpText="Show color swatches beside this field"
                checked={enableColors}
                onChange={(v) => { setEnableColors(v); if (!v) setTextColors([]); }}
              />
              {enableColors && (
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">Colors to offer</Text>
                  {assets && assets.colorSets.length > 0 && (
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodySm" tone="subdued">Load from library:</Text>
                      <select
                        onChange={(e) => {
                          const cs = assets.colorSets.find((s) => s.id === e.target.value);
                          if (cs) setTextColors(cs.entries.map((en) => ({ label: en.label, color: en.color })));
                          e.target.value = "";
                        }}
                        style={{ fontSize: "0.8125rem" }}
                        defaultValue=""
                      >
                        <option value="" disabled>Choose a color set…</option>
                        {assets.colorSets.map((cs) => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
                      </select>
                    </InlineStack>
                  )}
                  {textColors.map((c, i) => (
                    <InlineStack key={i} gap="200" blockAlign="end" wrap={false}>
                      <input
                        type="color"
                        value={c.color}
                        onChange={(e) => updateColor(i, "color", e.target.value)}
                        aria-label="Color"
                        style={{ width: "2.25rem", height: "2.25rem", padding: "2px", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer", flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <TextField label="Name" labelHidden placeholder="e.g. Gold" value={c.label} onChange={(v) => updateColor(i, "label", v)} autoComplete="off" />
                      </div>
                      <Button onClick={() => removeColor(i)} accessibilityLabel="Remove color">Remove</Button>
                    </InlineStack>
                  ))}
                  <div><Button onClick={addColor}>Add color</Button></div>
                </BlockStack>
              )}
              {/* Font size picker (SL-97) */}
              <Checkbox
                label="Let shoppers choose a font size"
                helpText="Show size pills beside this field"
                checked={enableSizes}
                onChange={(v) => setEnableSizes(v)}
              />
              {enableSizes && (
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">Sizes to offer (e.g. 12px, 16px, 24px)</Text>
                  {fontSizes.map((s, i) => (
                    <InlineStack key={i} gap="200" blockAlign="center" wrap={false}>
                      <div style={{ flex: 1 }}>
                        <TextField label="Size" labelHidden placeholder="e.g. 16px" value={s} onChange={(v) => updateSize(i, v)} autoComplete="off" />
                      </div>
                      <Button onClick={() => removeSize(i)} accessibilityLabel="Remove size">Remove</Button>
                    </InlineStack>
                  ))}
                  <div><Button onClick={addSize}>Add size</Button></div>
                </BlockStack>
              )}
            </>
          )}
        </FormLayout>
        <InlineStack gap="200">
          <Button variant="primary" submit loading={fetcher.state !== "idle"}>
            {actionType === "create" ? "Add field" : "Save"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </InlineStack>
      </BlockStack>
    </fetcher.Form>
  );
}

// SL-85: condition editor shown in-line per field row.
function FieldConditionEditor({
  field,
  allFields,
  conditions,
}: {
  field: FieldData;
  allFields: FieldData[];
  conditions: FieldConditionData[];
}) {
  const addFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [triggerFieldId, setTriggerFieldId] = useState("");
  const [conditionValue, setConditionValue] = useState("");
  const [showForm, setShowForm] = useState(false);

  const fieldConditions = conditions.filter((c) => c.fieldId === field.id);
  const otherFields = allFields.filter((f) => f.id !== field.id);

  useEffect(() => {
    if (addFetcher.state === "idle" && addFetcher.data?.ok) {
      setShowForm(false);
      setTriggerFieldId("");
      setConditionValue("");
    }
  }, [addFetcher.state, addFetcher.data]);

  if (otherFields.length === 0) return null;

  return (
    <BlockStack gap="200">
      <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Visibility</Text>
      {fieldConditions.length === 0 && !showForm && (
        <Text as="p" variant="bodySm" tone="subdued">Always visible</Text>
      )}
      {fieldConditions.map((cond) => {
        const triggerLabel = allFields.find((f) => f.id === cond.triggerFieldId)?.label ?? cond.triggerFieldId;
        return (
          <ConditionRow key={cond.id} cond={cond} triggerLabel={triggerLabel} />
        );
      })}
      {showForm ? (
        <addFetcher.Form method="post">
          <input type="hidden" name="_action" value="add_field_condition" />
          <input type="hidden" name="fieldId" value={field.id} />
          <input type="hidden" name="triggerFieldId" value={triggerFieldId} />
          <input type="hidden" name="conditionValue" value={conditionValue} />
          <InlineStack gap="200" blockAlign="end" wrap={false}>
            <Text as="span" variant="bodySm">Show when</Text>
            <div style={{ minWidth: "120px" }}>
              <select
                value={triggerFieldId}
                onChange={(e) => setTriggerFieldId(e.target.value)}
                style={{ width: "100%", padding: "4px 6px", border: "1px solid #c9cccf", borderRadius: "4px", fontSize: "13px" }}
                aria-label="Trigger field"
              >
                <option value="">— field —</option>
                {otherFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            <Text as="span" variant="bodySm">is</Text>
            <div style={{ minWidth: "100px" }}>
              <TextField label="" labelHidden value={conditionValue} onChange={setConditionValue} autoComplete="off" placeholder="e.g. Gold" helpText="Exact option value that shows this field" />
            </div>
            {addFetcher.data?.error && <Text as="span" tone="critical" variant="bodySm">{addFetcher.data.error}</Text>}
            <Button size="slim" submit loading={addFetcher.state !== "idle"} disabled={!triggerFieldId}>Add</Button>
            <Button size="slim" onClick={() => setShowForm(false)}>Cancel</Button>
          </InlineStack>
        </addFetcher.Form>
      ) : (
        <Button size="slim" onClick={() => setShowForm(true)}>+ Add condition</Button>
      )}
    </BlockStack>
  );
}

function ConditionRow({ cond, triggerLabel }: { cond: FieldConditionData; triggerLabel: string }) {
  const deleteFetcher = useFetcher();
  return (
    <InlineStack gap="200" blockAlign="center">
      <Text as="span" variant="bodySm" tone="subdued">
        Show when <b>{triggerLabel}</b> is <b>&ldquo;{cond.value}&rdquo;</b>
      </Text>
      <deleteFetcher.Form method="post" style={{ display: "inline" }}>
        <input type="hidden" name="_action" value="delete_field_condition" />
        <input type="hidden" name="conditionId" value={cond.id} />
        <Button tone="critical" size="slim" submit loading={deleteFetcher.state !== "idle"}>×</Button>
      </deleteFetcher.Form>
    </InlineStack>
  );
}

function FieldRow({
  field,
  isFirst,
  isLast,
  onEdit,
}: {
  field: FieldData;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
}) {
  const moveFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const typeLabel = FIELD_TYPE_OPTIONS.find((o) => o.value === field.type)?.label ?? field.type;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px 16px", borderBottom: "1px solid #f1f2f4" }}>
      {/* Top: title + type + required */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: "13px" }}>{field.label}</span>
        <Badge>{typeLabel}</Badge>
        {field.required && (
          <Text as="span" variant="bodySm" tone="subdued">Required</Text>
        )}
      </div>
      {/* Bottom: actions — always beneath the title for a consistent row layout (SL-112) */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <moveFetcher.Form method="post" style={{ display: "inline" }}>
          <input type="hidden" name="_action" value="move_up" />
          <input type="hidden" name="fieldId" value={field.id} />
          <Button submit disabled={isFirst || moveFetcher.state !== "idle"} size="slim" accessibilityLabel="Move up">↑</Button>
        </moveFetcher.Form>
        <moveFetcher.Form method="post" style={{ display: "inline" }}>
          <input type="hidden" name="_action" value="move_down" />
          <input type="hidden" name="fieldId" value={field.id} />
          <Button submit disabled={isLast || moveFetcher.state !== "idle"} size="slim" accessibilityLabel="Move down">↓</Button>
        </moveFetcher.Form>
        <Button size="slim" onClick={onEdit}>Edit</Button>
        <deleteFetcher.Form method="post" style={{ display: "inline" }}>
          <input type="hidden" name="_action" value="delete" />
          <input type="hidden" name="fieldId" value={field.id} />
          <Button submit tone="critical" size="slim" loading={deleteFetcher.state !== "idle"}>Delete</Button>
        </deleteFetcher.Form>
      </div>
    </div>
  );
}

// ── Live example helpers (mirror widget logic exactly) ────────────────────────

function validateLiveField(value: string, field: FieldData): string[] {
  const normalized = value.trim().replace(/\s+/g, " ");
  const chars = [...normalized];
  const billedChars = field.countSpaces ? chars : chars.filter((c) => c !== " ");
  const errors: string[] = [];
  if (field.minChars !== null && billedChars.length < field.minChars)
    errors.push(`Enter at least ${field.minChars} character${field.minChars === 1 ? "" : "s"}.`);
  if (field.maxChars !== null && billedChars.length > field.maxChars)
    errors.push(`Maximum ${field.maxChars} characters allowed.`);
  if (!field.allowSpaces && normalized.includes(" "))
    errors.push("Spaces are not allowed.");
  if (field.allowedChars) {
    const allowed = new Set([...field.allowedChars]);
    const bad = new Set(chars.filter((c) => c !== " " && !allowed.has(c)));
    if (bad.size > 0)
      errors.push(`Character${bad.size === 1 ? "" : "s"} ${[...bad].join(", ")} not allowed.`);
  }
  if (field.disallowedChars) {
    const dis = new Set([...field.disallowedChars]);
    const found = new Set(chars.filter((c) => dis.has(c)));
    if (found.size > 0)
      errors.push(`Character${found.size === 1 ? "" : "s"} ${[...found].join(", ")} not allowed.`);
  }
  return errors;
}

function calcFieldSurcharge(value: string, field: FieldData, rule: PricingRuleData | undefined, basePrice: number): number {
  if (!rule) return 0;
  const normalized = value.trim().replace(/\s+/g, " ");
  const hasValue = normalized.length > 0;
  const mode = rule.mode ?? "per_char";
  if (mode === "flat") return hasValue ? (rule.amount ?? 0) : 0;
  if (mode === "percent") return hasValue ? (rule.amount ?? 0) / 100 * basePrice : 0;
  // per_char
  const chars = field.countSpaces
    ? [...normalized]
    : [...normalized].filter((c) => c !== " ");
  return chars.reduce((sum, char) => {
    const group = rule.charGroups.find((g) => g.characters.includes(char));
    return sum + (group ? group.pricePerChar : rule.perCharPrice);
  }, 0);
}

function LiveExample({
  fields,
  pricingRules,
  variantPrices,
}: {
  fields: FieldData[];
  pricingRules: PricingRuleData[];
  variantPrices: number[];
}) {
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((f) => [f.id, ""]))
  );

  const basePrice = variantPrices.length > 0 ? Math.min(...variantPrices) : null;

  function handleChange(field: FieldData, raw: string) {
    // Strip chars the widget's keydown handler would block
    const filtered = [...raw]
      .filter((char) => {
        if (!field.allowSpaces && char === " ") return false;
        if (field.disallowedChars && field.disallowedChars.includes(char)) return false;
        if (field.allowedChars && char !== " " && !field.allowedChars.includes(char)) return false;
        return true;
      })
      .join("");
    setValues((prev) => ({ ...prev, [field.id]: filtered }));
  }

  const totalSurcharge = fields.reduce((sum, f) => {
    const rule = pricingRules.find((r) => r.fieldId === f.id);
    return sum + calcFieldSurcharge(values[f.id] ?? "", f, rule, basePrice ?? 0);
  }, 0);
  const estimatedTotal = basePrice !== null ? basePrice + totalSurcharge : null;

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">Live example</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Preview exactly what customers see — character rules, pricing, and inline errors all apply.
          </Text>
        </BlockStack>

        {fields.length === 0 ? (
          <Text as="p" variant="bodySm" tone="subdued">
            Add fields on the Fields tab to see a preview here.
          </Text>
        ) : (
          <BlockStack gap="400">
            {fields.map((field) => {
              const value = values[field.id] ?? "";
              const rule = pricingRules.find((r) => r.fieldId === field.id);
              const errors = value.length > 0 ? validateLiveField(value, field) : [];
              const normalized = value.trim().replace(/\s+/g, " ");
              const billedLen = field.countSpaces
                ? [...normalized].length
                : [...normalized].filter((c) => c !== " ").length;
              const hintUnit = field.countSpaces ? " characters" : " billed characters";
              const charHint = field.maxChars
                ? `${billedLen} / ${field.maxChars}${hintUnit}`
                : undefined;

              return (
                <BlockStack gap="150" key={field.id}>
                  <TextField
                    label={field.label}
                    value={value}
                    onChange={(v) => handleChange(field, v)}
                    maxLength={field.maxChars && field.countSpaces ? field.maxChars : undefined}
                    helpText={charHint}
                    error={errors.length > 0 ? errors[0] : undefined}
                    autoComplete="off"
                  />
                  {rule && (
                    <BlockStack gap="050">
                      {(!rule.mode || rule.mode === "per_char") && (
                        <>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Per-character price: ${rule.perCharPrice.toFixed(2)}
                          </Text>
                          {rule.charGroups.map((g) => (
                            <Text key={g.id} as="p" variant="bodySm" tone="subdued">
                              &nbsp;&nbsp;{g.label}: ${g.pricePerChar.toFixed(2)}
                            </Text>
                          ))}
                        </>
                      )}
                      {rule.mode === "flat" && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          Flat fee: ${rule.amount.toFixed(2)} when filled in
                        </Text>
                      )}
                      {rule.mode === "percent" && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          {rule.amount}% of base price when filled in
                        </Text>
                      )}
                    </BlockStack>
                  )}
                </BlockStack>
              );
            })}

            <Divider />

            <BlockStack gap="100">
              {basePrice !== null && (
                <Text as="p" variant="bodySm">
                  Base price:{" "}
                  <Text as="span" variant="bodySm" fontWeight="semibold">
                    ${basePrice.toFixed(2)} USD
                  </Text>
                </Text>
              )}
              {estimatedTotal !== null && (
                <Text as="p" variant="bodyMd">
                  Estimated total:{" "}
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    ${estimatedTotal.toFixed(2)} USD
                  </Text>
                </Text>
              )}
            </BlockStack>
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

// ── Pricing components ────────────────────────────────────────────────────────

function CharGroupRow({ group }: { group: CharPriceGroupData }) {
  const deleteFetcher = useFetcher();
  return (
    <InlineStack align="space-between" blockAlign="center" gap="400">
      <BlockStack gap="050">
        <Text as="span" variant="bodySm" fontWeight="semibold">{group.label}</Text>
        <Text as="span" variant="bodySm" tone="subdued">
          "{group.characters}" · ${group.pricePerChar.toFixed(4)}/char
        </Text>
      </BlockStack>
      <deleteFetcher.Form method="post">
        <input type="hidden" name="_action" value="delete_char_group" />
        <input type="hidden" name="groupId" value={group.id} />
        <Button tone="critical" size="slim" submit loading={deleteFetcher.state !== "idle"}>
          Delete
        </Button>
      </deleteFetcher.Form>
    </InlineStack>
  );
}

function FieldPricingCard({
  field,
  rule,
  onDirtyChange,
}: {
  field: FieldData;
  rule: PricingRuleData | undefined;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const priceFetcher = useFetcher<{ ok?: boolean }>();
  const groupFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const savedMode = rule?.mode ?? "per_char";
  const savedPerCharPrice = rule?.perCharPrice?.toFixed(4) ?? "0.0000";
  const savedAmount = rule?.amount?.toFixed(4) ?? "0.0000";
  const [mode, setMode] = useState(savedMode);
  const [perCharPrice, setPerCharPrice] = useState(savedPerCharPrice);
  const [amount, setAmount] = useState(savedAmount);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [groupLabel, setGroupLabel] = useState("");
  const [groupChars, setGroupChars] = useState("");
  const [groupPrice, setGroupPrice] = useState("0.0000");

  useEffect(() => {
    if (groupFetcher.state === "idle" && groupFetcher.data?.ok) {
      setShowAddGroup(false);
      setGroupLabel("");
      setGroupChars("");
      setGroupPrice("0.0000");
    }
  }, [groupFetcher.state, groupFetcher.data]);

  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const priceDirty =
    mode !== savedMode ||
    (mode === "per_char" && parseFloat(perCharPrice || "0") !== (rule?.perCharPrice ?? 0)) ||
    (mode !== "per_char" && parseFloat(amount || "0") !== (rule?.amount ?? 0));
  useEffect(() => {
    onDirtyChangeRef.current?.(priceDirty);
  }, [priceDirty]);
  useEffect(() => () => onDirtyChangeRef.current?.(false), []);

  const modeOptions = [
    { label: "Per letter", value: "per_char" },
    { label: "Flat fee", value: "flat" },
    { label: "Percentage of base price", value: "percent" },
  ];

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h3" variant="headingSm">{field.label}</Text>
        <priceFetcher.Form method="post">
          <input type="hidden" name="_action" value="set_field_price" />
          <input type="hidden" name="fieldId" value={field.id} />
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="perCharPrice" value={perCharPrice} />
          <input type="hidden" name="amount" value={amount} />
          <BlockStack gap="300">
            <InlineStack gap="300" blockAlign="end">
              <div style={{ width: "240px" }}>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", border: "1px solid #c9cccf", borderRadius: "4px", fontSize: "14px" }}
                  aria-label="Pricing mode"
                >
                  {modeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {mode === "per_char" && (
                <div style={{ width: "180px" }}>
                  <TextField
                    label="Price per character ($)"
                    type="number"
                    value={perCharPrice}
                    onChange={setPerCharPrice}
                    prefix="$"
                    autoComplete="off"
                  />
                </div>
              )}
              {mode === "flat" && (
                <div style={{ width: "180px" }}>
                  <TextField
                    label="Flat fee ($)"
                    type="number"
                    value={amount}
                    onChange={setAmount}
                    prefix="$"
                    helpText="Added when the field has any value"
                    autoComplete="off"
                  />
                </div>
              )}
              {mode === "percent" && (
                <div style={{ width: "180px" }}>
                  <TextField
                    label="Percentage (%)"
                    type="number"
                    value={amount}
                    onChange={setAmount}
                    suffix="%"
                    helpText="Of the product base price"
                    autoComplete="off"
                  />
                </div>
              )}
              <Button submit loading={priceFetcher.state !== "idle"}>Save</Button>
            </InlineStack>
          </BlockStack>
        </priceFetcher.Form>

        {mode === "per_char" && rule?.charGroups?.length ? (
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" tone="subdued">
              Character groups (override the default price per character)
            </Text>
            {rule.charGroups.map((g) => (
              <CharGroupRow key={g.id} group={g} />
            ))}
            <Divider />
          </BlockStack>
        ) : null}

        {mode === "per_char" && showAddGroup ? (
          <groupFetcher.Form method="post">
            <input type="hidden" name="_action" value="add_char_group" />
            <input type="hidden" name="fieldId" value={field.id} />
            <input type="hidden" name="groupLabel" value={groupLabel} />
            <input type="hidden" name="groupChars" value={groupChars} />
            <input type="hidden" name="groupPrice" value={groupPrice} />
            <BlockStack gap="300">
              <Text as="p" variant="bodySm" fontWeight="semibold">New character group</Text>
              {groupFetcher.data?.error && (
                <Banner tone="critical">{groupFetcher.data.error}</Banner>
              )}
              <FormLayout>
                <FormLayout.Group>
                  <TextField label="Group name" value={groupLabel} onChange={setGroupLabel} autoComplete="off" helpText='e.g. "Emoji"' />
                  <TextField
                    label="Characters"
                    value={groupChars}
                    onChange={setGroupChars}
                    autoComplete="off"
                    helpText="Paste the characters that belong to this group"
                  />
                  <TextField
                    label="Price per character ($)"
                    type="number"
                    value={groupPrice}
                    onChange={setGroupPrice}
                    prefix="$"
                    autoComplete="off"
                  />
                </FormLayout.Group>
              </FormLayout>
              <InlineStack gap="200">
                <Button variant="primary" submit loading={groupFetcher.state !== "idle"}>
                  Add group
                </Button>
                <Button onClick={() => setShowAddGroup(false)}>Cancel</Button>
              </InlineStack>
            </BlockStack>
          </groupFetcher.Form>
        ) : mode === "per_char" ? (
          <Button size="slim" onClick={() => setShowAddGroup(true)}>
            + Add character group
          </Button>
        ) : null}
      </BlockStack>
    </Card>
  );
}

// ── Live preview panel ────────────────────────────────────────────────────────

function PreviewFieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldData;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", border: "1px solid #c9cccf",
    borderRadius: "6px", padding: "6px 8px", fontSize: "13px", outline: "none", background: "#fff",
  };
  if (field.type === "text") {
    return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type to preview…" style={inputStyle} />;
  }
  if (field.type === "textarea") {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type to preview…" rows={2} style={{ ...inputStyle, resize: "vertical" as const }} />;
  }
  if (field.type === "dropdown") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">Select…</option>
        {field.options.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
      </select>
    );
  }
  if (field.type === "buttons") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {field.options.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange(value === o.label ? "" : o.label)}
            style={{ padding: "4px 12px", border: `1px solid ${value === o.label ? "#005bd3" : "#c9cccf"}`, borderRadius: "6px", background: value === o.label ? "#e3f0ff" : "#fff", cursor: "pointer", fontSize: "12px", fontWeight: value === o.label ? 600 : 400 }}>
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  if (field.type === "checkbox") {
    return (
      <label style={{ display: "flex", gap: "8px", alignItems: "center", cursor: "pointer", fontSize: "13px" }}>
        <input type="checkbox" checked={value === "Yes"} onChange={(e) => onChange(e.target.checked ? "Yes" : "")} />
        {field.label}
      </label>
    );
  }
  if (field.type === "swatches") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {field.options.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange(value === o.label ? "" : o.label)} title={o.label}
            style={{ width: 28, height: 28, borderRadius: "50%", background: o.swatchColor ?? "#000", border: value === o.label ? "3px solid #005bd3" : "2px solid #c9cccf", cursor: "pointer", padding: 0 }} />
        ))}
      </div>
    );
  }
  if (field.type === "image-swatches") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {field.options.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange(value === o.label ? "" : o.label)} title={o.label}
            style={{ width: 40, height: 40, borderRadius: "6px", padding: 0, border: value === o.label ? "3px solid #005bd3" : "1px solid #c9cccf", cursor: "pointer", overflow: "hidden", background: "#f6f6f7" }}>
            {o.imageUrl ? <img src={o.imageUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt={o.label} /> : <span style={{ fontSize: "10px" }}>{o.label}</span>}
          </button>
        ))}
      </div>
    );
  }
  if (field.type === "date") return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
  if (field.type === "number") return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" style={inputStyle} />;
  if (field.type === "text-block") return (
    // Display-only text block: show the label (heading) and/or the content, not
    // one falling back to the other (SL-115).
    <>
      {field.label && <div style={{ fontSize: "13px", fontWeight: 600, color: "#303030", marginBottom: "2px" }}>{field.label}</div>}
      {field.helpText && <p style={{ fontSize: "13px", color: "#6d7175", margin: 0 }}>{field.helpText}</p>}
    </>
  );
  if (field.type === "image-static") return field.helpText ? <img src={field.helpText} style={{ maxWidth: "100%", borderRadius: "4px" }} alt={field.label} /> : null;
  if (field.type === "upload") return <div style={{ border: "1px dashed #c9cccf", borderRadius: "6px", padding: "8px 12px", fontSize: "12px", color: "#6d7175" }}>File upload (preview only)</div>;
  return null;
}

function LivePreviewPanel({
  fields,
  pricingRules,
  variantPrices,
  productImageUrl,
  productTitle,
  previewEnabled,
  onTogglePreview,
  conditions,
  onCollapse,
}: {
  fields: FieldData[];
  pricingRules: PricingRuleData[];
  variantPrices: number[];
  productImageUrl: string | null;
  productTitle: string;
  previewEnabled: boolean;
  onTogglePreview: (enabled: boolean) => void;
  conditions: FieldConditionData[];
  onCollapse?: () => void;
}) {
  const textFields = fields.filter((f) => f.type === "text" || f.type === "textarea");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.id, ""]))
  );
  const [headerHover, setHeaderHover] = useState(false);

  // Inject Google Fonts for every font configured on any field of this product
  useEffect(() => {
    const fonts = [
      ...new Set(
        fields.flatMap((f) => {
          try { return f.fontOptions ? (JSON.parse(f.fontOptions) as string[]) : []; }
          catch { return [] as string[]; }
        })
      ),
    ].filter(Boolean);
    if (!fonts.length) return;
    const id = "etch-admin-google-fonts";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${fonts.map((f) => `family=${f.replace(/ /g, "+")}`).join("&")}&display=swap`;
  }, [fields]);

  function isFieldVisible(fieldId: string): boolean {
    const fieldConditions = conditions.filter((c) => c.fieldId === fieldId);
    if (fieldConditions.length === 0) return true;
    return fieldConditions.some((c) => values[c.triggerFieldId] === c.value);
  }

  const basePrice = variantPrices.length > 0 ? Math.min(...variantPrices) : null;

  const totalSurcharge = fields.reduce((sum, f) => {
    const value = values[f.id] ?? "";
    if (!value) return sum;
    if (f.type === "text" || f.type === "textarea") {
      const rule = pricingRules.find((r) => r.fieldId === f.id);
      return sum + calcFieldSurcharge(value, f, rule, basePrice ?? 0);
    }
    if (isChoiceType(f.type)) {
      const selectedOpt = f.options.find((o) => o.label === value);
      return sum + (selectedOpt?.priceDelta ?? 0);
    }
    return sum;
  }, 0);
  const totalChars = textFields.reduce((sum, f) => {
    const v = (values[f.id] ?? "").trim().replace(/\s+/g, " ");
    const chars = f.countSpaces ? [...v] : [...v].filter((c) => c !== " ");
    return sum + chars.length;
  }, 0);

  // fieldStyles: font/color/size from text field config; swatch overlay color from selected option
  const fieldStyles = Object.fromEntries(
    fields.map((f) => {
      let font = "";
      let color = "";
      let fontSize = "";
      try { const fonts: string[] = f.fontOptions ? JSON.parse(f.fontOptions) : []; if (fonts.length) font = fonts[0]; } catch {}
      try { const colors: { label: string; color: string }[] = f.textColorOptions ? JSON.parse(f.textColorOptions) : []; if (colors.length) color = colors[0].color; } catch {}
      try { const sizes: string[] = f.fontSizeOptions ? JSON.parse(f.fontSizeOptions) : []; if (sizes.length) fontSize = sizes[0]; } catch {}
      if (f.type === "swatches") {
        const sel = f.options.find((o) => o.label === (values[f.id] ?? ""));
        if (sel?.swatchColor) color = sel.swatchColor;
      }
      return [f.id, { font, color: color || "#ffffff", fontSize }];
    })
  );

  return (
    <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", overflow: "hidden", background: "white", position: "sticky", top: "16px" }}>
      {/* Header — side-by-side it's a full-width button that collapses the preview
          (click anywhere, matching the side rail); the same dark bar becomes the
          vertical side rail when collapsed (SL-118, SL-119). */}
      {onCollapse ? (
        <button
          type="button"
          onClick={onCollapse}
          onMouseEnter={() => setHeaderHover(true)}
          onMouseLeave={() => setHeaderHover(false)}
          title="Hide preview"
          aria-label="Hide preview"
          aria-expanded={true}
          style={{ width: "100%", boxSizing: "border-box", background: headerHover ? "#1a1a1a" : "#303030", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.12s" }}
        >
          <span style={{ color: "white", fontWeight: 600, fontSize: "13px" }}>Live Preview</span>
          <span aria-hidden="true" style={{ color: "rgba(255,255,255,0.85)", fontSize: "18px", lineHeight: 1 }}>›</span>
        </button>
      ) : (
        <div style={{ background: "#303030", padding: "10px 14px", display: "flex", alignItems: "center" }}>
          <span style={{ color: "white", fontWeight: 600, fontSize: "13px" }}>Live Preview</span>
        </div>
      )}

      {/* Product image + draggable overlay (text fields) + static overlays (all other field types with placement) */}
      <PreviewPlacementBoxEditor
        fields={fields}
        productImageUrl={productImageUrl}
        previewValues={values}
        fieldStyles={fieldStyles}
      />

      {/* Unified field inputs — all field types */}
      <div style={{ padding: "14px 16px" }}>
        <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "2px" }}>{productTitle}</div>
        {basePrice !== null && (
          <div style={{ color: "#616568", fontSize: "13px", marginBottom: "12px" }}>
            ${basePrice.toFixed(2)}
            {totalSurcharge > 0 && (
              <span style={{ color: "#1a7f37" }}> + ${totalSurcharge.toFixed(2)}</span>
            )}
          </div>
        )}

        <div style={{ marginBottom: "12px" }}>
          {fields.filter((f) => isFieldVisible(f.id)).map((field) => (
            <div key={field.id} style={{ marginBottom: "8px" }}>
              {field.type !== "checkbox" && field.type !== "text-block" && field.type !== "image-static" && (
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#303030", marginBottom: "4px" }}>
                  {field.label}
                </label>
              )}
              <PreviewFieldInput
                field={field}
                value={values[field.id] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [field.id]: v }))}
              />
            </div>
          ))}
        </div>

        {totalSurcharge > 0 && (
          <div style={{ fontSize: "12px", color: "#1a7f37", marginBottom: "10px", fontWeight: 500 }}>
            {totalChars > 0 ? `${totalChars} char${totalChars !== 1 ? "s" : ""} · ` : ""}+${totalSurcharge.toFixed(2)} added to price
          </div>
        )}

        <div style={{ background: "#303030", color: "white", textAlign: "center", padding: "10px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 600, userSelect: "none", marginBottom: "12px" }}>
          Add to cart (preview only)
        </div>

        {textFields.length > 0 && (
          <div style={{ borderTop: "1px solid #f1f2f4", paddingTop: "10px" }}>
            <Checkbox
              label="Show text overlay on storefront"
              helpText="Customers see the overlay live as they type"
              checked={previewEnabled}
              onChange={onTogglePreview}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <Page>
      <Banner title="Something went wrong" tone="critical">
        <p>{error instanceof Error ? error.message : "An unexpected error occurred."}</p>
      </Banner>
    </Page>
  );
}

// ── Template picker (shown in empty state) ────────────────────────────────────

function TemplatePicker({ merchantTemplates }: { merchantTemplates: { id: string; name: string; payload: string }[] }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const busy = fetcher.state !== "idle";

  function applyTemplate(payload: string) {
    fetcher.submit({ _action: "apply_template", payload }, { method: "post" });
  }

  const allTemplates = [
    ...BUILT_IN_TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, payload: JSON.stringify(t.fields), fieldCount: t.fields.length })),
    ...merchantTemplates.map((t) => {
      let fieldCount = 0;
      try { fieldCount = (JSON.parse(t.payload) as unknown[]).length; } catch { /* ok */ }
      return { id: t.id, name: t.name, description: `${fieldCount} saved field${fieldCount !== 1 ? "s" : ""}`, payload: t.payload, fieldCount };
    }),
  ];

  if (allTemplates.length === 0) return null;

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingSm" as="h3">Start from a template</Text>
        <Text as="p" tone="subdued" variant="bodySm">Pick a starting point and adjust from there — or skip this and add fields manually below.</Text>
        {fetcher.data?.error && <Banner tone="critical">{fetcher.data.error}</Banner>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          {allTemplates.map((t) => (
            <div key={t.id} style={{ border: "1px solid #e1e3e5", borderRadius: "8px", padding: "1rem", minWidth: "10rem", maxWidth: "14rem", flex: "1 1 10rem" }}>
              <BlockStack gap="200">
                <Text as="span" fontWeight="semibold">{t.name}</Text>
                <Text as="span" variant="bodySm" tone="subdued">{t.description}</Text>
                <Button size="slim" onClick={() => applyTemplate(t.payload)} loading={busy} disabled={busy}>
                  Apply
                </Button>
              </BlockStack>
            </div>
          ))}
        </div>
      </BlockStack>
    </Card>
  );
}

// ── Save as template button ───────────────────────────────────────────────────

function SaveAsTemplateButton() {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setOpen(false);
      setName("");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <>
      <div>
        <Button variant="plain" onClick={() => setOpen(true)}>Save as template</Button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Save fields as template">
        <Modal.Section>
          <BlockStack gap="300">
            {fetcher.data?.error && <Banner tone="critical">{fetcher.data.error}</Banner>}
            <TextField label="Template name" value={name} onChange={setName} autoComplete="off" placeholder="e.g. Jewelry engraving" helpText="Saved templates can be applied to other products from the Assets section." />
            <InlineStack gap="200">
              <Button
                variant="primary"
                loading={busy}
                disabled={busy || !name.trim()}
                onClick={() => fetcher.submit({ _action: "save_as_template", templateName: name }, { method: "post" })}
              >
                Save template
              </Button>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
            </InlineStack>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}

// PlacementBox type now lives in ~/utils/placementGeometry (SL-114).

const BOX_COLORS = ["#5c6ac4", "#47c1bf", "#f49342", "#de3618", "#50b83c"];

function PreviewPlacementBoxEditor({
  fields,
  productImageUrl,
  previewValues,
  fieldStyles,
}: {
  fields: FieldData[];
  productImageUrl: string | null;
  previewValues?: Record<string, string>;
  fieldStyles?: Record<string, { font: string; color: string; fontSize: string }>;
}) {
  const textFields = fields.filter((f) => f.type === "text" || f.type === "textarea");
  const placementFetcher = useFetcher();
  const containerRef = useRef<HTMLDivElement>(null);

  const [placements, setPlacementBoxs] = useState<Record<string, PlacementBox>>(() => {
    const map: Record<string, PlacementBox> = {};
    textFields.forEach((f) => {
      map[f.id] = {
        x: (f as any).previewX ?? 10,
        y: (f as any).previewY ?? 40,
        w: (f as any).previewW ?? 80,
        h: (f as any).previewH ?? 15,
        rotation: (f as any).previewRotation ?? 0,
      };
    });
    return map;
  });

  const placementsRef = useRef(placements);
  useEffect(() => { placementsRef.current = placements; }, [placements]);

  const dragging = useRef<{
    fieldId: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    startP: PlacementBox;
    grabOffsetX?: number;
    grabOffsetY?: number;
  } | null>(null);

  const rotating = useRef<{
    fieldId: string;
    startAngle: number;
    startRotation: number;
    centerX: number;
    centerY: number;
  } | null>(null);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (rotating.current) {
        const { fieldId, startAngle, startRotation, centerX, centerY } = rotating.current;
        const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
        const newRotation = ((startRotation + (angle - startAngle)) % 360 + 360) % 360;
        setPlacementBoxs((prev) => ({ ...prev, [fieldId]: { ...prev[fieldId], rotation: Math.round(newRotation) } }));
        return;
      }
      if (!dragging.current || !containerRef.current) return;
      const { fieldId, mode, startX, startY, startP, grabOffsetX = 0, grabOffsetY = 0 } = dragging.current;
      const rect = containerRef.current.getBoundingClientRect();
      // Both branches compute from startP + current pointer (no accumulation),
      // so there's no drift. Resize keeps the opposite corner fixed and works
      // in the box's rotated local frame (SL-114).
      setPlacementBoxs((prev) => {
        if (mode === "move") {
          const dx = ((e.clientX - startX) / rect.width) * 100;
          const dy = ((e.clientY - startY) / rect.height) * 100;
          return { ...prev, [fieldId]: moveBox(startP, dx, dy) };
        }
        return {
          ...prev,
          [fieldId]: resizeRotatedBox(
            startP, "se",
            e.clientX - rect.left, e.clientY - rect.top,
            rect.width, rect.height,
            grabOffsetX, grabOffsetY,
          ),
        };
      });
    }
    function onMouseUp() {
      const activeId = rotating.current?.fieldId ?? dragging.current?.fieldId;
      rotating.current = null;
      dragging.current = null;
      if (!activeId) return;
      const p = placementsRef.current[activeId];
      placementFetcher.submit(
        {
          _action: "save_preview_placement",
          fieldId: activeId,
          previewX: String(Math.round(p.x * 100) / 100),
          previewY: String(Math.round(p.y * 100) / 100),
          previewW: String(Math.round(p.w * 100) / 100),
          previewH: String(Math.round(p.h * 100) / 100),
          previewRotation: String(Math.round(p.rotation)),
        },
        { method: "post" }
      );
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // SL-135: if a selected choice option carries a preview image, show it as the base
  // image instead of the product photo (last selected option with one wins).
  const selectedPreviewImage = fields.reduce<string | null>((acc, f) => {
    const sel = (f.options ?? []).find((o) => o.label === (previewValues?.[f.id] ?? ""));
    return sel?.previewImageUrl || acc;
  }, null);
  const baseImageUrl = selectedPreviewImage || productImageUrl;

  return (
    <BlockStack gap="200">
      <Text as="p" tone="subdued">
        Drag to move · corner handle to resize · ↺ handle to rotate.
      </Text>
      <div
        ref={containerRef}
        // Container hugs the image (fit-content) and is centered, so the % based
        // placement overlays stay aligned to the visible image. maxHeight keeps
        // tall images (e.g. snowboards) compact instead of dominating the panel (SL-110).
        style={{ position: "relative", display: "block", width: "fit-content", maxWidth: "100%", margin: "0 auto", userSelect: "none" }}
      >
        {baseImageUrl ? (
          <img
            src={baseImageUrl}
            alt="Product"
            style={{ display: "block", width: "auto", height: "auto", maxWidth: "100%", maxHeight: "440px", borderRadius: "8px" }}
          />
        ) : (
          <div style={{ background: "#f6f6f7", borderRadius: "8px", width: "300px", maxWidth: "100%", height: "200px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Text as="p" tone="subdued">No product image</Text>
          </div>
        )}
        {textFields.map((field, idx) => {
          const p = placements[field.id] ?? { x: 10, y: 40, w: 80, h: 15, rotation: 0 };
          const color = BOX_COLORS[idx % BOX_COLORS.length];
          const liveText = previewValues?.[field.id] ?? "";
          const hasLiveText = liveText.length > 0;
          const textColor = hasLiveText && fieldStyles?.[field.id]?.color
            ? fieldStyles[field.id].color
            : hasLiveText ? "#ffffff" : color;
          const textFont = fieldStyles?.[field.id]?.font ?? undefined;
          const textSize = fieldStyles?.[field.id]?.fontSize || undefined;
          return (
            <div
              key={field.id}
              onMouseDown={(e) => {
                e.preventDefault();
                dragging.current = { fieldId: field.id, mode: "move", startX: e.clientX, startY: e.clientY, startP: { ...p } };
              }}
              style={{
                position: "absolute",
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${p.w}%`,
                height: `${p.h}%`,
                border: hasLiveText ? "1px dashed rgba(255,255,255,0.5)" : `2px solid ${color}`,
                background: hasLiveText ? "transparent" : `${color}22`,
                cursor: "move",
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
                transformOrigin: "center center",
              }}
            >
              <span style={{
                color: textColor,
                fontFamily: textFont,
                fontSize: (hasLiveText && textSize) ? textSize : hasLiveText ? "16px" : "12px",
                fontWeight: 600,
                textShadow: hasLiveText ? "0 1px 4px rgba(0,0,0,0.6)" : undefined,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "90%",
              }}>
                {hasLiveText ? liveText : field.label}
              </span>
              {/* Degree badge — shown when rotated */}
              {p.rotation !== 0 && (
                <span style={{
                  position: "absolute",
                  bottom: 2,
                  left: 4,
                  fontSize: "9px",
                  color: "#fff",
                  background: "rgba(0,0,0,0.45)",
                  borderRadius: 3,
                  padding: "0 3px",
                  pointerEvents: "none",
                  lineHeight: "14px",
                }}>
                  {Math.round(p.rotation)}°
                </span>
              )}
              {/* Rotation handle — top-right corner */}
              <div
                title="Drag to rotate"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (!containerRef.current) return;
                  const rect = containerRef.current.getBoundingClientRect();
                  const centerX = rect.left + (p.x + p.w / 2) / 100 * rect.width;
                  const centerY = rect.top + (p.y + p.h / 2) / 100 * rect.height;
                  const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
                  rotating.current = { fieldId: field.id, startAngle, startRotation: p.rotation, centerX, centerY };
                }}
                style={{
                  position: "absolute",
                  top: -8,
                  right: -8,
                  width: 16,
                  height: 16,
                  background: color,
                  border: "2px solid #fff",
                  borderRadius: "50%",
                  cursor: "crosshair",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  color: "#fff",
                  lineHeight: 1,
                  userSelect: "none",
                }}>
                ↺
              </div>
              {/* Resize handle — bottom-right corner */}
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  // Capture the gap between the pointer and the SE corner so the
                  // box doesn't jump on the first move (SL-114).
                  let grabOffsetX = 0, grabOffsetY = 0;
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (rect) {
                    const se = cornerPx(p, rect.width, rect.height, "se");
                    grabOffsetX = e.clientX - rect.left - se.x;
                    grabOffsetY = e.clientY - rect.top - se.y;
                  }
                  dragging.current = { fieldId: field.id, mode: "resize", startX: e.clientX, startY: e.clientY, startP: { ...p }, grabOffsetX, grabOffsetY };
                }}
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: "12px",
                  height: "12px",
                  background: color,
                  cursor: "se-resize",
                  borderRadius: "2px 0 4px 0",
                }}
              />
            </div>
          );
        })}
        {/* Static value overlays for non-text fields that have placement configured */}
        {fields
          .filter((f) => f.type !== "text" && f.type !== "textarea")
          .filter((f) => (f as any).previewX != null)
          .filter((f) => previewValues?.[f.id])
          .map((field) => {
            const x = (field as any).previewX as number;
            const y = (field as any).previewY as number;
            const w = (field as any).previewW as number ?? 80;
            const h = (field as any).previewH as number ?? 15;
            const rotation = ((field as any).previewRotation as number) || 0;
            const value = previewValues![field.id];
            const style = fieldStyles?.[field.id];
            return (
              <div
                key={field.id}
                style={{
                  position: "absolute",
                  left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`,
                  pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center",
                  transform: rotation ? `rotate(${rotation}deg)` : undefined,
                  transformOrigin: "center center",
                }}
              >
                <span style={{
                  color: style?.color ?? "#ffffff",
                  fontFamily: style?.font || undefined,
                  fontSize: style?.fontSize || "16px",
                  fontWeight: 600,
                  textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "90%",
                }}>
                  {value}
                </span>
              </div>
            );
          })
        }
      </div>
    </BlockStack>
  );
}

export default function ProductDetailPage() {
  const { product, shop, productImageUrl, published, previewEnabled, liveContentHash, publishedContentHash, fields, pricingRules, conditions, variantPrices, assets, merchantTemplates, themeEditorDeepLink } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // SL-111: user-draggable split between the field editor and the live preview,
  // side-by-side only. previewPct = width % of the preview column, clamped so
  // neither pane becomes unusable; persisted per product.
  const RATIO_KEY = `etch_preview_ratio_${product.id.split("/").pop() ?? product.id}`;
  const [previewPct, setPreviewPct] = useState(60);
  const previewPctRef = useRef(previewPct);
  useEffect(() => { previewPctRef.current = previewPct; }, [previewPct]);
  const [dividerHover, setDividerHover] = useState(false);
  const [railHover, setRailHover] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  const draggingDivider = useRef(false);

  // SL-113: collapse the whole preview column (side-by-side) so the fields section
  // expands to near-full width, leaving only a thin rail. Toggled via the rail
  // chevron; persisted per product (reuses the old preview-panel key).
  const PANEL_KEY = `etch_preview_panel_${product.id.split("/").pop() ?? product.id}`;
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  useEffect(() => {
    if (localStorage.getItem(PANEL_KEY) === "0") setPreviewCollapsed(true);
  }, [PANEL_KEY]);
  const togglePreviewCollapsed = () =>
    setPreviewCollapsed((c) => {
      const next = !c;
      localStorage.setItem(PANEL_KEY, next ? "0" : "1");
      return next;
    });

  useEffect(() => {
    const saved = localStorage.getItem(RATIO_KEY);
    if (saved) {
      const n = parseFloat(saved);
      if (!isNaN(n)) setPreviewPct(Math.max(30, Math.min(72, n)));
    }
  }, [RATIO_KEY]);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingDivider.current || !layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const leftPct = ((e.clientX - rect.left) / rect.width) * 100;
      setPreviewPct(Math.max(30, Math.min(72, 100 - leftPct)));
    };
    const onUp = () => {
      if (!draggingDivider.current) return;
      draggingDivider.current = false;
      document.body.style.userSelect = "";
      localStorage.setItem(RATIO_KEY, String(Math.round(previewPctRef.current)));
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [RATIO_KEY]);

  // Onboarding guide state
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);
  const [fieldCalloutDismissed, setFieldCalloutDismissed] = useState(false);
  const [pricingCalloutDismissed, setPricingCalloutDismissed] = useState(false);
  const [publishCalloutDismissed, setPublishCalloutDismissed] = useState(false);

  useEffect(() => {
    setOnboardingComplete(localStorage.getItem("etch_onboarding_complete") === "1");
    setFieldCalloutDismissed(localStorage.getItem("etch_banner_fields_dismissed") === "1");
    setPricingCalloutDismissed(localStorage.getItem("etch_banner_pricing_dismissed") === "1");
    setPublishCalloutDismissed(localStorage.getItem("etch_banner_publish_dismissed") === "1");
  }, []);

  const publishFetcher = useFetcher<{ ok?: boolean }>();
  const isPublishing = publishFetcher.state !== "idle";

  // SL-123: "Publish changes" pushes the current draft to customers. Dirty = the draft
  // version differs from the last-published snapshot; cleared optimistically while a
  // publish (either "Publish changes" or activating) is in flight.
  const changesFetcher = useFetcher<{ ok?: boolean }>();
  const isPublishingChanges = changesFetcher.state !== "idle";
  const hasUnpublishedChanges =
    !isPublishingChanges && !isPublishing &&
    liveContentHash !== publishedContentHash &&
    // Nothing to publish on a brand-new product that has never been published.
    !(publishedContentHash === null && fields.length === 0);
  const publishChanges = () =>
    changesFetcher.submit({ _action: "publish_changes" }, { method: "post" });

  // Warn before leaving the product page only when a field editor has unsaved input —
  // drafts are always saved, so unpublished changes are NOT a reason to prompt (SL-133).
  // beforeunload can't be used (blocked in the App Bridge iframe), so this covers in-app
  // navigation only, which is the common case.
  const [fieldEditorDirty, setFieldEditorDirty] = useState(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      fieldEditorDirty && currentLocation.pathname !== nextLocation.pathname
  );

  const previewFetcher = useFetcher<{ ok?: boolean }>();
  const optimisticPreview =
    previewFetcher.state !== "idle"
      ? previewFetcher.formData?.get("previewEnabled") === "true"
      : previewEnabled;

  const tokenFetcher = useFetcher<{ token?: string; error?: string }>();
  useEffect(() => {
    if (tokenFetcher.state === "idle" && tokenFetcher.data?.token) {
      window.open(`https://${shop}/products/${product.handle}?etch_preview=${tokenFetcher.data.token}`, "_blank");
    }
  }, [tokenFetcher.state, tokenFetcher.data, shop, product.handle]);

  const optimisticPublished =
    isPublishing
      ? publishFetcher.formData?.get("published") === "true"
      : published;

  // The Step 3/4/5 onboarding banners exist to guide a merchant to publish. Once
  // the product is published they've served their purpose, so hide them for
  // already-published products (they otherwise reappear on every reload since the
  // dismiss state is not persisted across page loads). See SL-60.
  const showOnboarding = !onboardingComplete && !optimisticPublished;

  // Track last publish intent in a ref so we can read it after state returns to "idle"
  // (formData is typed as never when state === "idle").
  const lastPublishedValue = useRef<string | null>(null);
  useEffect(() => {
    if (publishFetcher.state !== "idle" && publishFetcher.formData) {
      lastPublishedValue.current = publishFetcher.formData.get("published") as string | null;
    }
  }, [publishFetcher.state, publishFetcher.formData]);

  // Detect first publish — show congrats and set the flag permanently
  useEffect(() => {
    if (
      publishFetcher.state === "idle" &&
      publishFetcher.data?.ok === true &&
      lastPublishedValue.current === "true" &&
      !onboardingComplete
    ) {
      lastPublishedValue.current = null;
      localStorage.setItem("etch_onboarding_complete", "1");
      setOnboardingComplete(true);
      setShowCongrats(true);
    }
  }, [publishFetcher.state, publishFetcher.data, onboardingComplete]);

  const [showTypePicker, setShowTypePicker] = useState(false);
  const [pickedType, setPickedType] = useState<string | null>(null);

  const handleEdit = useCallback((id: string) => {
    setShowAddForm(false);
    setEditingFieldId(id);
  }, []);
  const handleEditClose = useCallback(() => setEditingFieldId(null), []);
  const handleAddOpen = useCallback(() => {
    setEditingFieldId(null);
    setShowTypePicker(true);
  }, []);
  const handleTypePick = useCallback((type: string) => {
    setShowTypePicker(false);
    setPickedType(type);
    setShowAddForm(true);
  }, []);
  const handleTypePickCancel = useCallback(() => setShowTypePicker(false), []);
  const handleAddClose = useCallback(() => { setShowAddForm(false); setPickedType(null); }, []);

  const editingField = editingFieldId ? (fields.find((f) => f.id === editingFieldId) ?? null) : null;

  return (
    <Page
      title={product.title}
      titleMetadata={
        <Badge tone={optimisticPublished ? "success" : "new"}>
          {optimisticPublished ? "Active" : "Inactive"}
        </Badge>
      }
      backAction={{ content: "Products", url: "/app/products" }}
      secondaryActions={[
        {
          content: "Preview on store",
          loading: tokenFetcher.state !== "idle",
          onAction: () => tokenFetcher.submit({ _action: "generate_preview_token" }, { method: "post" }),
        },
        {
          content: optimisticPublished ? "Deactivate" : "Activate",
          loading: isPublishing,
          onAction: () =>
            publishFetcher.submit(
              { _action: "set_published", published: String(!optimisticPublished) },
              { method: "post" }
            ),
        },
      ]}
      primaryAction={{
        content: "Publish changes",
        disabled: !hasUnpublishedChanges,
        loading: isPublishingChanges,
        onAction: publishChanges,
      }}
    >
      <BlockStack gap="400">
        {showCongrats && (
          <Banner
            title="You're all set! Your first custom pricing is live."
            tone="success"
            onDismiss={() => setShowCongrats(false)}
          >
            <BlockStack gap="300">
              <Text as="p">
                Your custom pricing is live. The last step is adding the Etch widget to this
                product's page so customers can enter their text and see the price update in
                real time — Etch applies the correct charge at checkout automatically.
              </Text>
              {themeEditorDeepLink && (
                <InlineStack>
                  <Button url={themeEditorDeepLink} target="_blank" external variant="primary">
                    Add the Etch widget to your product page
                  </Button>
                </InlineStack>
              )}
              <Text as="p" tone="subdued">
                This opens your theme editor. If you don't see the widget added automatically,
                choose <b>Add block</b> and search for <b>Etch Customization</b>. Full steps are on our{" "}
                <Button variant="plain" onClick={() => navigate("/app/support")}>
                  Help &amp; Support page
                </Button>.
              </Text>
            </BlockStack>
          </Banner>
        )}

        {showOnboarding && !publishCalloutDismissed && (
          <Banner
            title="Step 5 of 5: Go live!"
            tone="info"
            onDismiss={() => { localStorage.setItem("etch_banner_publish_dismissed", "1"); setPublishCalloutDismissed(true); }}
          >
            <Text as="p">
              Once you've added a field and set your pricing below, click the{" "}
              <b>Publish</b> button in the top-right corner. Your custom pricing will go live
              on your storefront immediately. Your customers will see it the
              next time they view this product.
            </Text>
          </Banner>
        )}

      {showOnboarding && fields.length === 0 && !fieldCalloutDismissed && (
        <Banner
          title="Step 3 of 5: Add a text field"
          tone="info"
          onDismiss={() => { localStorage.setItem("etch_banner_fields_dismissed", "1"); setFieldCalloutDismissed(true); }}
        >
          <BlockStack gap="200">
            <Text as="p">
              A <b>field</b> is a text box shown to your customer on the product page. For
              example: "Enter your engraving text here" or "Monogram initials (max 3 letters)".
              Etch will charge per character based on whatever your customer types in.
            </Text>
            <Text as="p"><b>Label:</b> the name of the input that your customer will see.</Text>
            <Text as="p"><b>Min/Max characters:</b> optional limits on how long the input can be.</Text>
            <Text as="p"><b>Allowed/Disallowed characters:</b> optionally restrict to certain letters or symbols.</Text>
            <Text as="p">
              Click <b>Add field</b> below to create your first one. Pricing options will appear on each text field.
            </Text>
          </BlockStack>
        </Banner>
      )}
      {showOnboarding && fields.some((f) => f.type === "text" || f.type === "textarea") && pricingRules.length === 0 && !pricingCalloutDismissed && (
        <Banner
          title="Step 4 of 5: Set your pricing"
          tone="info"
          onDismiss={() => { localStorage.setItem("etch_banner_pricing_dismissed", "1"); setPricingCalloutDismissed(true); }}
        >
          <BlockStack gap="200">
            <Text as="p">
              <b>Per-character price:</b> charged for each character the customer types.
              For example, at $0.50/char, the word "Hello" (5 characters) adds $2.50 to the cart.
            </Text>
            <Text as="p">
              <b>Flat fee:</b> a fixed amount added when the field has any value.
            </Text>
            <Text as="p">
              <b>Character groups</b> (optional): charge a different price for specific
              character sets. For example, emoji or special symbols could cost more than
              regular letters.
            </Text>
            <Text as="p">
              Set pricing for each text field below, then click <b>Publish</b> to go live.
            </Text>
          </BlockStack>
        </Banner>
      )}
      <div
        ref={layoutRef}
        style={isNarrow
          ? { display: "flex", flexDirection: "column", gap: "16px" }
          : (editingField || fields.length > 0)
            ? { display: "grid", gridTemplateColumns: previewCollapsed ? "1fr 34px" : `${100 - previewPct}fr 16px ${previewPct}fr`, alignItems: "flex-start" }
            : { display: "block" }}>
        {/* Left column */}
        <div>
          {editingField ? (
            <BlockStack gap="400">
              <InlineStack blockAlign="center" gap="200">
                <Button onClick={handleEditClose} size="slim">← Back</Button>
                <Text as="span" variant="bodySm" tone="subdued">Editing: <b>{editingField.label}</b></Text>
              </InlineStack>
              <Card>
                <FieldForm field={editingField} actionType="update" onClose={handleEditClose} assets={assets} onDirtyChange={setFieldEditorDirty} />
              </Card>
              <FieldConditionEditor field={editingField} allFields={fields} conditions={conditions} />
              {(editingField.type === "text" || editingField.type === "textarea") && (
                <FieldPricingCard field={editingField} rule={pricingRules.find((r) => r.fieldId === editingField.id)} />
              )}
            </BlockStack>
          ) : (
            <BlockStack gap="400">
              {fields.length === 0 && !showAddForm && (
                <TemplatePicker merchantTemplates={merchantTemplates} />
              )}
              {fields.length > 0 && (
                <SaveAsTemplateButton />
              )}
              <Card padding="0">
                {fields.length === 0 && !showAddForm ? (
                  <EmptyState
                    heading="No customization fields yet"
                    image=""
                    action={{ content: "Add field", onAction: handleAddOpen }}
                  >
                    <Text as="p">
                      Define the inputs customers fill in when customizing this product.
                    </Text>
                  </EmptyState>
                ) : (
                  <>
                    {fields.map((field, index) => (
                      <FieldRow
                        key={field.id}
                        field={field}
                        isFirst={index === 0}
                        isLast={index === fields.length - 1}
                        onEdit={() => handleEdit(field.id)}
                      />
                    ))}
                    {showAddForm && (
                      <Box padding="400">
                        <BlockStack gap="300">
                          <Text as="h3" variant="headingSm">New field</Text>
                          <FieldForm actionType="create" onClose={handleAddClose} assets={assets} initialType={pickedType ?? undefined} onDirtyChange={setFieldEditorDirty} />
                        </BlockStack>
                      </Box>
                    )}
                  </>
                )}
              </Card>
              {!showAddForm && fields.length > 0 && (
                <BlockStack gap="100">
                  <Button onClick={handleAddOpen} variant="primary">Add field</Button>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Changes aren’t live until you hit Publish.
                  </Text>
                </BlockStack>
              )}
              {/* Scroll clearance so the sticky preview can scroll fully alongside — only
                  needed when the preview is open side-by-side; when collapsed it would
                  make the side rail run past the fields (SL-118). */}
              {!isNarrow && !previewCollapsed && <div style={{ height: "80px" }} />}
            </BlockStack>
          )}
        </div>

        {/* SL-111 draggable divider — resize only now; collapse lives in the preview
            header (SL-118). Side-by-side, expanded only. */}
        {!isNarrow && (editingField || fields.length > 0) && !previewCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize the preview"
            onMouseEnter={() => setDividerHover(true)}
            onMouseLeave={() => setDividerHover(false)}
            onMouseDown={(e) => {
              e.preventDefault();
              draggingDivider.current = true;
              document.body.style.userSelect = "none";
            }}
            style={{ alignSelf: "stretch", display: "flex", justifyContent: "center", cursor: "col-resize", paddingTop: "16px" }}
          >
            <div
              style={{
                width: dividerHover ? "4px" : "3px",
                alignSelf: "stretch",
                minHeight: "60px",
                borderRadius: "2px",
                background: dividerHover ? "#8c9196" : "#c9cccf",
                transition: "background 0.1s, width 0.1s",
              }}
            />
          </div>
        )}

        {/* SL-117 collapsed rail — a single full-height vertical button. Reuses the
            dark #303030 of the Live Preview panel header so it reads as the preview,
            with the chevron grouped directly above the vertical label. */}
        {!isNarrow && (editingField || fields.length > 0) && previewCollapsed && (
          <button
            type="button"
            onClick={togglePreviewCollapsed}
            onMouseEnter={() => setRailHover(true)}
            onMouseLeave={() => setRailHover(false)}
            title="Show preview"
            aria-label="Show preview"
            aria-expanded={false}
            style={{
              alignSelf: "stretch",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "12px 0",
              border: "none",
              borderRadius: "8px",
              background: railHover ? "#1a1a1a" : "#303030",
              color: "#fff",
              cursor: "pointer",
              transition: "background 0.12s",
            }}
          >
            <span style={{ fontSize: "15px", lineHeight: 1 }}>‹</span>
            <span style={{ writingMode: "vertical-rl", fontSize: "11px", fontWeight: 600, letterSpacing: "0.02em", userSelect: "none" }}>
              Live preview
            </span>
          </button>
        )}

        {/* Right column: live preview (unified — all field types).
            Sticky only side-by-side; full width when stacked below the editor (SL-110).
            Hidden when collapsed side-by-side (SL-113). */}
        {(editingField || fields.length > 0) && (isNarrow || !previewCollapsed) && (
          <div style={isNarrow ? { width: "100%" } : { position: "sticky", top: "16px" }}>
            <LivePreviewPanel
              fields={fields}
              pricingRules={pricingRules}
              variantPrices={variantPrices}
              productImageUrl={productImageUrl}
              productTitle={product.title}
              previewEnabled={optimisticPreview}
              conditions={conditions}
              onCollapse={isNarrow ? undefined : togglePreviewCollapsed}
              onTogglePreview={(checked) =>
                previewFetcher.submit(
                  { _action: "toggle_preview", previewEnabled: String(checked) },
                  { method: "post" }
                )
              }
            />
          </div>
        )}
      </div>
      </BlockStack>
      <TypePickerModal open={showTypePicker} onSelect={handleTypePick} onCancel={handleTypePickCancel} />
      {/* Unsaved-field prompt on leave (SL-133) */}
      <Modal
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="You’re still editing a field"
        primaryAction={{ content: "Keep editing", onAction: () => blocker.reset?.() }}
        secondaryActions={[
          { content: "Leave anyway", onAction: () => blocker.proceed?.() },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            You have a field open with changes you haven’t saved. If you leave now, those
            edits won’t be saved. Leave anyway?
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
