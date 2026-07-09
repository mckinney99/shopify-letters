import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRouteError, useNavigate } from "@remix-run/react";
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
  Tabs,
  Divider,
  Badge,
  Checkbox,
  Modal,
  Select,
} from "@shopify/polaris";
import { useEffect, useRef, useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { buildPricingConfig, computeConfigVersion } from "../utils/pricingConfig";
import { buildThemeEditorDeepLink } from "../utils/themeEditor";
import { BUILT_IN_TEMPLATES, type TemplateField } from "../utils/templates";

const PRODUCT_QUERY = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      title
      featuredImage {
        url
      }
      variants(first: 50) {
        edges {
          node {
            price
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

// Serializes current fields + pricing rules to a product metafield so the
// Cart Transform function can enforce the correct price at checkout without
// network calls (Shopify Functions constraint — see docs/spike-sl25-shopify-functions.md).
async function syncPricingMetafield(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  shop: string,
  productGid: string
): Promise<void> {
  const [fields, pricingRules, conditions] = await Promise.all([
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

  const config = buildPricingConfig(fields, pricingRules, conditions);
  const value = JSON.stringify({
    version: computeConfigVersion(config),
    // Lets the checkout functions include a shop identifier in their
    // structured logs without a Shop.id field being queryable — see SL-31.
    shop,
    ...config,
  });

  try {
    const res = await admin.graphql(METAFIELDS_SET_MUTATION, {
      variables: {
        metafields: [{ ownerId: productGid, namespace: "etch", key: "pricing_rules", type: "json", value }],
      },
    });
    const { data } = await res.json();
    const errs = data?.metafieldsSet?.userErrors ?? [];
    if (errs.length > 0) {
      console.error("[syncPricingMetafield] userErrors:", JSON.stringify(errs));
    } else {
      console.log("[syncPricingMetafield] wrote metafield for", productGid, "value length:", value.length);
    }
  } catch (err) {
    console.error("[syncPricingMetafield] exception:", err);
  }
}

type FieldOptionData = {
  id: string;
  label: string;
  priceDelta: number;
  swatchColor?: string | null;
  imageUrl?: string | null;
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
  fileAccept?: string | null;
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

// Built-in fonts offered for the per-field font chooser (SL-81).
const BUILT_IN_FONTS = [
  "Georgia",
  "Times New Roman",
  "Arial",
  "Courier New",
  "Dancing Script",
  "Cinzel",
  "Playfair Display",
  "Oswald",
  "Caveat",
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
function parseOptions(raw: string | null): { label: string; priceDelta: number; swatchColor?: string; imageUrl?: string }[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Array<{ label?: unknown; priceDelta?: unknown; swatchColor?: unknown; imageUrl?: unknown }>;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((o) => ({
        label: typeof o.label === "string" ? o.label.trim() : "",
        priceDelta: Number(o.priceDelta) || 0,
        swatchColor: typeof o.swatchColor === "string" ? o.swatchColor : undefined,
        imageUrl: typeof o.imageUrl === "string" ? o.imageUrl : undefined,
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
      select: { published: true, previewEnabled: true },
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

  return json({
    product: data.product as { id: string; title: string },
    productImageUrl: (data.product as any).featuredImage?.url ?? null,
    published: config?.published ?? false,
    previewEnabled: config?.previewEnabled ?? false,
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
        fileAccept,
        position: count,
        options: {
          create: options.map((o, i) => ({ label: o.label, priceDelta: o.priceDelta, swatchColor: o.swatchColor ?? null, imageUrl: o.imageUrl ?? null, position: i })),
        },
      },
    });
    await syncPricingMetafield(admin, shop, productGid);
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
        fileAccept,
      },
    });
    // Only touch options if the field is actually owned by this shop.
    if (updated.count > 0) {
      // Replace the option set. Also clears options when switching away from a choice type.
      await prisma.fieldOption.deleteMany({ where: { fieldId, field: { shop } } });
      if (options.length > 0) {
        await prisma.fieldOption.createMany({
          data: options.map((o, i) => ({ fieldId, label: o.label, priceDelta: o.priceDelta, swatchColor: o.swatchColor ?? null, imageUrl: o.imageUrl ?? null, position: i })),
        });
      }
    }
    await syncPricingMetafield(admin, shop, productGid);
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
    await syncPricingMetafield(admin, shop, productGid);
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
    await syncPricingMetafield(admin, shop, productGid);
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
    await syncPricingMetafield(admin, shop, productGid);
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
    await syncPricingMetafield(admin, shop, productGid);
    return json({ ok: true });
  }

  if (_action === "set_published") {
    const published = form.get("published") === "true";
    await prisma.productConfig.upsert({
      where: { shop_productId: { shop, productId: productGid } },
      update: { published },
      create: { shop, productId: productGid, published },
    });
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
    await syncPricingMetafield(admin, shop, productGid);
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
    await syncPricingMetafield(admin, shop, productGid);
    return json({ ok: true });
  }

  if (_action === "delete_field_condition") {
    const conditionId = form.get("conditionId") as string;
    await prisma.fieldCondition.deleteMany({ where: { id: conditionId, shop } });
    await syncPricingMetafield(admin, shop, productGid);
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
          fontOptions: f.fontOptions, textColorOptions: f.textColorOptions,
          fileAccept: f.fileAccept, position: existingCount + i,
        },
      });
      if (f.options.length > 0) {
        await prisma.fieldOption.createMany({
          data: f.options.map((o, j) => ({
            fieldId: created.id, label: o.label, priceDelta: o.priceDelta,
            swatchColor: o.swatchColor ?? null, imageUrl: o.imageUrl ?? null, position: j,
          })),
        });
      }
    }
    await syncPricingMetafield(admin, shop, productGid);
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
      fileAccept: f.fileAccept,
      options: f.options.map((o) => ({
        label: o.label, priceDelta: o.priceDelta,
        swatchColor: o.swatchColor ?? undefined, imageUrl: o.imageUrl ?? undefined,
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

function FieldForm({
  field,
  actionType,
  onClose,
  onDirtyChange,
  assets,
}: {
  field?: FieldData;
  actionType: "create" | "update";
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  assets?: AssetLibrary;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [label, setLabel] = useState(field?.label ?? "");
  const [type, setType] = useState(field?.type ?? "text");
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
  // Font chooser (SL-81) — stored as JSON array of font names on the field.
  const initialFonts: string[] = field?.fontOptions ? (JSON.parse(field.fontOptions) as string[]) : [];
  const [enableFonts, setEnableFonts] = useState(initialFonts.length > 0);
  const [selectedFonts, setSelectedFonts] = useState<string[]>(initialFonts);
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
  }));
  const [options, setOptions] = useState<{ label: string; priceDelta: string; swatchColor: string; imageUrl: string }[]>(initialOptions);
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
  const addOption = () => setOptions((prev) => [...prev, { label: "", priceDelta: "", swatchColor: "#000000", imageUrl: "" }]);
  const removeOption = (i: number) => setOptions((prev) => prev.filter((_, idx) => idx !== i));
  const updateOption = (i: number, key: "label" | "priceDelta" | "swatchColor" | "imageUrl", val: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, [key]: val } : o)));

  // Computed hidden values for SL-81 and SL-82.
  const fontOptionsValue = enableFonts && selectedFonts.length > 0 ? JSON.stringify(selectedFonts) : "";
  const textColorOptionsValue = enableColors && textColors.length > 0 ? JSON.stringify(textColors) : "";

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
    checkboxPrice !== initialCheckboxPrice ||
    JSON.stringify(options) !== JSON.stringify(initialOptions);
  useEffect(() => { onDirtyChangeRef.current?.(dirty); }, [dirty]);
  useEffect(() => () => onDirtyChangeRef.current?.(false), []);

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

          {/* ── Display-only elements (SL-79) ─────────────────────────────── */}
          {isDisplay && (
            <TextField
              label={type === "text-block" ? "Content" : "Image URL"}
              helpText={type === "text-block" ? "This text appears as instructions in your form." : "Paste the URL of an image to display (e.g. a sizing guide)."}
              value={helpText}
              onChange={setHelpText}
              multiline={type === "text-block" ? 3 : undefined}
              autoComplete="off"
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
                          if (os) setOptions(os.entries.map((en) => ({ label: en.label, priceDelta: String(en.priceDelta), swatchColor: "#000000", imageUrl: "" })));
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
                          if (cs) setOptions(cs.entries.map((en) => ({ label: en.label, priceDelta: "0", swatchColor: en.color, imageUrl: "" })));
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
                          if (img) setOptions((prev) => [...prev, { label: img.name, priceDelta: "0", swatchColor: "#000000", imageUrl: img.url }]);
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
                  <InlineStack key={i} gap="200" blockAlign="end" wrap={false}>
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
                        <TextField
                          label="Image URL"
                          labelHidden
                          placeholder="https://... (image URL)"
                          value={opt.imageUrl}
                          onChange={(v) => updateOption(i, "imageUrl", v)}
                          autoComplete="off"
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
                <TextField label="Min characters" type="number" value={minChars} onChange={setMinChars} autoComplete="off" />
                <TextField label="Max characters" type="number" value={maxChars} onChange={setMaxChars} autoComplete="off" />
              </FormLayout.Group>
              <FormLayout.Group>
                <TextField label="Allowed characters" helpText="Only these characters will be accepted (leave blank for all)" value={allowedChars} onChange={setAllowedChars} autoComplete="off" />
                <TextField label="Disallowed characters" helpText="These characters will be rejected (leave blank to allow all)" value={disallowedChars} onChange={setDisallowedChars} autoComplete="off" />
              </FormLayout.Group>
              <FormLayout.Group>
                <Checkbox label="Allow spaces" helpText="Customers can type spaces in this field" checked={allowSpaces} onChange={setAllowSpaces} />
                <Checkbox label="Count spaces toward price" helpText="When off, spaces are excluded from the billed character count" checked={countSpaces} onChange={setCountSpaces} />
              </FormLayout.Group>
              {/* Font chooser (SL-81) */}
              <Checkbox
                label="Let shoppers choose a font"
                helpText="Show a font picker beside this field"
                checked={enableFonts}
                onChange={(v) => { setEnableFonts(v); if (!v) setSelectedFonts([]); }}
              />
              {enableFonts && (
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Fonts to offer</Text>
                  {BUILT_IN_FONTS.map((f) => (
                    <Checkbox key={f} label={f} checked={selectedFonts.includes(f)} onChange={() => toggleFont(f)} />
                  ))}
                  {assets && assets.fonts.length > 0 && (
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodySm" tone="subdued">From library:</Text>
                      {assets.fonts.filter((f) => !selectedFonts.includes(f.name)).map((f) => (
                        <Button key={f.id} size="slim" variant="plain" onClick={() => setSelectedFonts((prev) => [...prev, f.name])}>
                          + {f.name}
                        </Button>
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
              <TextField label="" labelHidden value={conditionValue} onChange={setConditionValue} autoComplete="off" placeholder="value" />
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
  allFields,
  conditions,
  assets,
  isFirst,
  isLast,
  isEditing,
  onEdit,
  onEditClose,
  onDirtyChange,
}: {
  field: FieldData;
  allFields: FieldData[];
  conditions: FieldConditionData[];
  assets?: AssetLibrary;
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onEditClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const moveFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  if (isEditing) {
    return (
      <Box padding="400" borderBlockEndWidth="025" borderColor="border">
        <FieldForm field={field} actionType="update" onClose={onEditClose} onDirtyChange={onDirtyChange} assets={assets} />
      </Box>
    );
  }

  const charInfo: string[] = [];
  if (field.minChars !== null || field.maxChars !== null) {
    const parts: string[] = [];
    if (field.minChars !== null) parts.push(`min ${field.minChars}`);
    if (field.maxChars !== null) parts.push(`max ${field.maxChars}`);
    charInfo.push(`chars: ${parts.join(", ")}`);
  }
  if (field.allowedChars) charInfo.push(`allowed: "${field.allowedChars}"`);
  if (field.disallowedChars) charInfo.push(`disallowed: "${field.disallowedChars}"`);
  if (!field.allowSpaces) charInfo.push("no spaces");
  if (field.countSpaces) charInfo.push("spaces billed");

  return (
    <Box padding="400" borderBlockEndWidth="025" borderColor="border">
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" gap="400">
          <BlockStack gap="100">
            <Text as="span" variant="bodyMd" fontWeight="semibold">{field.label}</Text>
            {charInfo.length > 0 && (
              <Text as="span" variant="bodySm" tone="subdued">{charInfo.join(" · ")}</Text>
            )}
          </BlockStack>
          <InlineStack gap="200" blockAlign="center">
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
          </InlineStack>
        </InlineStack>
        <FieldConditionEditor field={field} allFields={allFields} conditions={conditions} />
      </BlockStack>
    </Box>
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

function PricingTab({
  fields,
  pricingRules,
  variantPrices,
  onFieldPricingDirty,
}: {
  fields: FieldData[];
  pricingRules: PricingRuleData[];
  variantPrices: number[];
  onFieldPricingDirty?: (fieldId: string, dirty: boolean) => void;
}) {
  const minPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : null;
  const maxPrice = variantPrices.length > 0 ? Math.max(...variantPrices) : null;
  const hasPriceRange = minPrice !== null && maxPrice !== null && minPrice !== maxPrice;
  const basePriceLabel = minPrice !== null
    ? `$${minPrice.toFixed(2)}${hasPriceRange ? ` – $${maxPrice!.toFixed(2)}` : ""}`
    : "—";

  return (
    <BlockStack gap="500">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">Base price</Text>
          <Text as="p" variant="bodyLg" fontWeight="semibold">{basePriceLabel}</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Pulled from your Shopify product. Etch adds the per-character surcharge on top at checkout.
          </Text>
        </BlockStack>
      </Card>

      {fields.length === 0 ? (
        <Banner tone="info">
          Add customization fields on the Fields tab first to configure per-character pricing.
        </Banner>
      ) : (
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Per-field pricing</Text>
          {fields.map((field) => (
            <FieldPricingCard
              key={field.id}
              field={field}
              rule={pricingRules.find((r) => r.fieldId === field.id)}
              onDirtyChange={onFieldPricingDirty ? (dirty) => onFieldPricingDirty(field.id, dirty) : undefined}
            />
          ))}
        </BlockStack>
      )}

      <LiveExample fields={fields} pricingRules={pricingRules} variantPrices={variantPrices} />
    </BlockStack>
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

type PlacementBox = { x: number; y: number; w: number; h: number };

const BOX_COLORS = ["#5c6ac4", "#47c1bf", "#f49342", "#de3618", "#50b83c"];

function PreviewPlacementBoxEditor({
  fields,
  productImageUrl,
}: {
  fields: FieldData[];
  productImageUrl: string | null;
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
  } | null>(null);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const { fieldId, mode, startX, startY, startP } = dragging.current;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = ((e.clientX - startX) / rect.width) * 100;
      const dy = ((e.clientY - startY) / rect.height) * 100;
      setPlacementBoxs((prev) => {
        const p = { ...prev[fieldId] };
        if (mode === "move") {
          p.x = Math.max(0, Math.min(100 - startP.w, startP.x + dx));
          p.y = Math.max(0, Math.min(100 - startP.h, startP.y + dy));
        } else {
          p.w = Math.max(10, Math.min(100 - startP.x, startP.w + dx));
          p.h = Math.max(5, Math.min(100 - startP.y, startP.h + dy));
        }
        return { ...prev, [fieldId]: p };
      });
    }
    function onMouseUp() {
      if (!dragging.current) return;
      const { fieldId } = dragging.current;
      dragging.current = null;
      const p = placementsRef.current[fieldId];
      placementFetcher.submit(
        {
          _action: "save_preview_placement",
          fieldId,
          previewX: String(Math.round(p.x * 100) / 100),
          previewY: String(Math.round(p.y * 100) / 100),
          previewW: String(Math.round(p.w * 100) / 100),
          previewH: String(Math.round(p.h * 100) / 100),
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

  if (textFields.length === 0) return null;

  return (
    <BlockStack gap="200">
      <Text as="p" tone="subdued">
        Drag each box to position the text on your product image.
      </Text>
      <div
        ref={containerRef}
        style={{ position: "relative", display: "inline-block", width: "100%", userSelect: "none" }}
      >
        {productImageUrl ? (
          <img
            src={productImageUrl}
            alt="Product"
            style={{ display: "block", width: "100%", height: "auto", borderRadius: "8px" }}
          />
        ) : (
          <div style={{ background: "#f6f6f7", borderRadius: "8px", height: "200px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Text as="p" tone="subdued">No product image</Text>
          </div>
        )}
        {textFields.map((field, idx) => {
          const p = placements[field.id] ?? { x: 10, y: 40, w: 80, h: 15 };
          const color = BOX_COLORS[idx % BOX_COLORS.length];
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
                border: `2px solid ${color}`,
                background: `${color}22`,
                cursor: "move",
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
              }}
            >
              <span style={{ color, fontSize: "12px", fontWeight: 600, pointerEvents: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "90%" }}>
                {field.label}
              </span>
              {/* Resize handle — bottom-right corner */}
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  dragging.current = { fieldId: field.id, mode: "resize", startX: e.clientX, startY: e.clientY, startP: { ...p } };
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
      </div>
    </BlockStack>
  );
}

export default function ProductDetailPage() {
  const { product, productImageUrl, published, previewEnabled, fields, pricingRules, conditions, variantPrices, assets, merchantTemplates, themeEditorDeepLink } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState(0);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Unsaved-changes guard for tab switches (SL-68). The field form is mutually
  // exclusive (one add- or edit-form open at a time), so a single boolean suffices.
  // Pricing has one card per field, so we track the set of dirty field ids.
  const [fieldFormDirty, setFieldFormDirty] = useState(false);
  const dirtyPricingFieldsRef = useRef<Set<string>>(new Set());
  const [pricingFormDirty, setPricingFormDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<number | null>(null);

  const reportPricingDirty = useCallback((fieldId: string, dirty: boolean) => {
    const set = dirtyPricingFieldsRef.current;
    if (dirty) set.add(fieldId);
    else set.delete(fieldId);
    setPricingFormDirty(set.size > 0);
  }, []);

  const hasUnsavedChanges = fieldFormDirty || pricingFormDirty;

  const handleTabSelect = useCallback(
    (index: number) => {
      if (hasUnsavedChanges) setPendingTab(index);
      else setSelectedTab(index);
    },
    [hasUnsavedChanges]
  );

  const confirmLeaveTab = useCallback(() => {
    // Discard: clear dirty tracking and switch. Unmounting the current tab's
    // forms also fires their own onDirtyChange(false), keeping state consistent.
    dirtyPricingFieldsRef.current.clear();
    setPricingFormDirty(false);
    setFieldFormDirty(false);
    if (pendingTab !== null) setSelectedTab(pendingTab);
    setPendingTab(null);
  }, [pendingTab]);

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

  const previewFetcher = useFetcher<{ ok?: boolean }>();
  const optimisticPreview =
    previewFetcher.state !== "idle"
      ? previewFetcher.formData?.get("previewEnabled") === "true"
      : previewEnabled;
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

  const handleEdit = useCallback((id: string) => {
    setShowAddForm(false);
    setEditingFieldId(id);
  }, []);
  const handleEditClose = useCallback(() => setEditingFieldId(null), []);
  const handleAddOpen = useCallback(() => {
    setEditingFieldId(null);
    setShowAddForm(true);
  }, []);
  const handleAddClose = useCallback(() => setShowAddForm(false), []);

  const tabs = [
    { id: "fields", content: "Fields" },
    { id: "pricing", content: "Pricing" },
  ];

  return (
    <Page
      title={product.title}
      titleMetadata={
        <Badge tone={optimisticPublished ? "success" : "new"}>
          {optimisticPublished ? "Published" : "Draft"}
        </Badge>
      }
      backAction={{ content: "Products", url: "/app/products" }}
      primaryAction={{
        content: optimisticPublished ? "Unpublish" : "Publish",
        loading: isPublishing,
        onAction: () =>
          publishFetcher.submit(
            { _action: "set_published", published: String(!optimisticPublished) },
            { method: "post" }
          ),
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

      <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabSelect}>
        <Box paddingBlockStart="400">
          {selectedTab === 0 ? (
            <BlockStack gap="400">
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
                      Click <b>Add field</b> below to create your first one, then head to the{" "}
                      <b>Pricing</b> tab to set your prices.
                    </Text>
                  </BlockStack>
                </Banner>
              )}
              {fields.length === 0 && !showAddForm && (
                <TemplatePicker merchantTemplates={merchantTemplates} />
              )}
              {fields.length > 0 && (
                <SaveAsTemplateButton />
              )}
              {fields.some((f) => f.type === "text" || f.type === "textarea") && (
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="p" fontWeight="semibold">Text preview</Text>
                        <Text as="p" tone="subdued">
                          Show the customer's text overlaid on the product image as they type.
                        </Text>
                      </BlockStack>
                      <Checkbox
                        label="Enable preview"
                        labelHidden
                        checked={optimisticPreview}
                        onChange={(checked) =>
                          previewFetcher.submit(
                            { _action: "toggle_preview", previewEnabled: String(checked) },
                            { method: "post" }
                          )
                        }
                      />
                    </InlineStack>
                    {optimisticPreview && (
                      <PreviewPlacementBoxEditor
                        fields={fields}
                        productImageUrl={productImageUrl}
                      />
                    )}
                  </BlockStack>
                </Card>
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
                        allFields={fields}
                        conditions={conditions}
                        assets={assets}
                        isFirst={index === 0}
                        isLast={index === fields.length - 1}
                        isEditing={editingFieldId === field.id}
                        onEdit={() => handleEdit(field.id)}
                        onEditClose={handleEditClose}
                        onDirtyChange={setFieldFormDirty}
                      />
                    ))}
                    {showAddForm && (
                      <Box padding="400">
                        <BlockStack gap="300">
                          <Text as="h3" variant="headingSm">New field</Text>
                          <FieldForm actionType="create" onClose={handleAddClose} onDirtyChange={setFieldFormDirty} assets={assets} />
                        </BlockStack>
                      </Box>
                    )}
                  </>
                )}
              </Card>
              {!showAddForm && fields.length > 0 && (
                <Button onClick={handleAddOpen} variant="primary">Add field</Button>
              )}
            </BlockStack>
          ) : (
            <BlockStack gap="400">
              {showOnboarding && pricingRules.length === 0 && !pricingCalloutDismissed && (
                <Banner
                  title="Step 4 of 5: Set your pricing"
                  tone="info"
                  onDismiss={() => { localStorage.setItem("etch_banner_pricing_dismissed", "1"); setPricingCalloutDismissed(true); }}
                >
                  <BlockStack gap="200">
                    <Text as="p">
                      <b>Base price:</b> a flat fee added to every order for this product, no matter how
                      many characters the customer types. Use this if there's a fixed setup cost
                      (e.g. $5.00 for any engraving job).
                    </Text>
                    <Text as="p">
                      <b>Per-character price:</b> charged for each character the customer types.
                      For example, at $0.50/char, the word "Hello" (5 characters) adds $2.50 to the cart.
                    </Text>
                    <Text as="p">
                      <b>Character groups</b> (optional): charge a different price for specific
                      character sets. For example, emoji or special symbols could cost more than
                      regular letters.
                    </Text>
                    <Text as="p">
                      Once you're happy with your pricing, head back to this page's top-right corner
                      and click <b>Publish</b> to go live.
                    </Text>
                  </BlockStack>
                </Banner>
              )}
              <PricingTab fields={fields} pricingRules={pricingRules} variantPrices={variantPrices} onFieldPricingDirty={reportPricingDirty} />
            </BlockStack>
          )}
        </Box>
      </Tabs>
      </BlockStack>

      <Modal
        open={pendingTab !== null}
        onClose={() => setPendingTab(null)}
        title="Unsaved changes"
        primaryAction={{ content: "Leave anyway", destructive: true, onAction: confirmLeaveTab }}
        secondaryActions={[{ content: "Go back", onAction: () => setPendingTab(null) }]}
      >
        <Modal.Section>
          <Text as="p">
            {fieldFormDirty
              ? "You have an unsaved field. Go back to finish adding it, or leave and discard your changes."
              : "You have unsaved pricing changes. Go back to save them, or leave and discard your changes."}
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
