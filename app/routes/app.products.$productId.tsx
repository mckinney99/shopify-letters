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

const PRODUCT_QUERY = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      title
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
  const [fields, pricingRules] = await Promise.all([
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

  const config = buildPricingConfig(fields, pricingRules);
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
  charGroups: CharPriceGroupData[];
};

// Field types offered in the "Field type" selector. `text` is the original
// single-line input and stays the default so existing fields are unchanged.
// New types are added here as later stories land (dropdown, checkbox, ...).
const FIELD_TYPE_OPTIONS = [
  { label: "Short text", value: "text" },
  { label: "Paragraph text", value: "textarea" },
  { label: "Dropdown", value: "dropdown" },
];

// Choice fields present a fixed list of options instead of free text.
const CHOICE_TYPES = ["dropdown", "checkbox", "buttons"];
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
function parseOptions(raw: string | null): { label: string; priceDelta: number }[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Array<{ label?: unknown; priceDelta?: unknown }>;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((o) => ({
        label: typeof o.label === "string" ? o.label.trim() : "",
        priceDelta: Number(o.priceDelta) || 0,
      }))
      .filter((o) => o.label !== "");
  } catch {
    return [];
  }
}

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

  const [productRes, fields, pricingRules, config] = await Promise.all([
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
    prisma.productConfig.findUnique({
      where: { shop_productId: { shop: session.shop, productId: productGid } },
      select: { published: true },
    }),
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
    published: config?.published ?? false,
    fields,
    pricingRules,
    variantPrices,
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
    const options = isChoiceType(type) ? parseOptions(form.get("options") as string) : [];

    const error = validateField({ label, minChars, maxChars, allowedChars, disallowedChars });
    if (error) return json({ error }, { status: 422 });
    if (isChoiceType(type) && options.length === 0)
      return json({ error: "Add at least one option for a dropdown field." }, { status: 422 });

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
        position: count,
        options: {
          create: options.map((o, i) => ({ label: o.label, priceDelta: o.priceDelta, position: i })),
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
    const options = isChoiceType(type) ? parseOptions(form.get("options") as string) : [];

    const error = validateField({ label, minChars, maxChars, allowedChars, disallowedChars });
    if (error) return json({ error }, { status: 422 });
    if (isChoiceType(type) && options.length === 0)
      return json({ error: "Add at least one option for a dropdown field." }, { status: 422 });

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
      },
    });
    // Only touch options if the field is actually owned by this shop.
    if (updated.count > 0) {
      // Replace the option set (scoped to this shop's field). Also clears
      // options when a field is switched away from a choice type.
      await prisma.fieldOption.deleteMany({ where: { fieldId, field: { shop } } });
      if (options.length > 0) {
        await prisma.fieldOption.createMany({
          data: options.map((o, i) => ({ fieldId, label: o.label, priceDelta: o.priceDelta, position: i })),
        });
      }
    }
    await syncPricingMetafield(admin, shop, productGid);
    return json({ ok: true });
  }

  if (_action === "delete") {
    const fieldId = form.get("fieldId") as string;
    await prisma.customizationField.deleteMany({ where: { id: fieldId, shop } });
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
    const perCharPrice = parseFloat((form.get("perCharPrice") as string) || "0") || 0;
    await prisma.pricingRule.upsert({
      where: { shop_productId_fieldId: { shop, productId: productGid, fieldId } },
      update: { perCharPrice },
      create: { shop, productId: productGid, fieldId, perCharPrice },
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

  return json({ error: "Unknown action" }, { status: 400 });
};

// ── Field components ──────────────────────────────────────────────────────────

function FieldForm({
  field,
  actionType,
  onClose,
  onDirtyChange,
}: {
  field?: FieldData;
  actionType: "create" | "update";
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
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
  const initialOptions = (field?.options ?? []).map((o) => ({ label: o.label, priceDelta: String(o.priceDelta) }));
  const [options, setOptions] = useState<{ label: string; priceDelta: string }[]>(initialOptions);

  const choice = isChoiceType(type);
  const addOption = () => setOptions((prev) => [...prev, { label: "", priceDelta: "" }]);
  const removeOption = (i: number) => setOptions((prev) => prev.filter((_, idx) => idx !== i));
  const updateOption = (i: number, key: "label" | "priceDelta", val: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, [key]: val } : o)));

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  // Report unsaved-change (dirty) state up so the parent can guard tab switches (SL-68).
  // A ref keeps us immune to onDirtyChange identity churn between renders.
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
    JSON.stringify(options) !== JSON.stringify(initialOptions);
  useEffect(() => {
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);
  // Clear the flag when the form unmounts (closed, saved, or discarded).
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
        <input type="hidden" name="options" value={JSON.stringify(options)} />
        {fetcher.data?.error && <Banner tone="critical">{fetcher.data.error}</Banner>}
        <FormLayout>
          <TextField label="Label" value={label} onChange={setLabel} autoComplete="off" requiredIndicator />
          <Select
            label="Field type"
            options={FIELD_TYPE_OPTIONS}
            value={type}
            onChange={setType}
            helpText="Short text is one line, paragraph text is a box, dropdown is a list of choices."
          />
          {choice ? (
            <>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">Options</Text>
                {options.map((opt, i) => (
                  <InlineStack key={i} gap="200" blockAlign="end" wrap={false}>
                    <div style={{ flex: 2 }}>
                      <TextField
                        label="Choice"
                        labelHidden
                        placeholder="e.g. 18 inch"
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
                <div>
                  <Button onClick={addOption}>Add option</Button>
                </div>
              </BlockStack>
              <Checkbox
                label="Required"
                helpText="Shoppers must choose an option before adding to cart"
                checked={required}
                onChange={setRequired}
              />
            </>
          ) : (
            <>
              <FormLayout.Group>
                <TextField label="Min characters" type="number" value={minChars} onChange={setMinChars} autoComplete="off" />
                <TextField label="Max characters" type="number" value={maxChars} onChange={setMaxChars} autoComplete="off" />
              </FormLayout.Group>
              <FormLayout.Group>
                <TextField
                  label="Allowed characters"
                  helpText="Only these characters will be accepted (leave blank for all)"
                  value={allowedChars}
                  onChange={setAllowedChars}
                  autoComplete="off"
                />
                <TextField
                  label="Disallowed characters"
                  helpText="These characters will be rejected (leave blank to allow all)"
                  value={disallowedChars}
                  onChange={setDisallowedChars}
                  autoComplete="off"
                />
              </FormLayout.Group>
              <FormLayout.Group>
                <Checkbox
                  label="Allow spaces"
                  helpText="Customers can type spaces in this field"
                  checked={allowSpaces}
                  onChange={setAllowSpaces}
                />
                <Checkbox
                  label="Count spaces toward price"
                  helpText="When off, spaces are excluded from the billed character count"
                  checked={countSpaces}
                  onChange={setCountSpaces}
                />
              </FormLayout.Group>
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

function FieldRow({
  field,
  isFirst,
  isLast,
  isEditing,
  onEdit,
  onEditClose,
  onDirtyChange,
}: {
  field: FieldData;
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
        <FieldForm field={field} actionType="update" onClose={onEditClose} onDirtyChange={onDirtyChange} />
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

function calcFieldSurcharge(value: string, field: FieldData, rule: PricingRuleData | undefined): number {
  if (!rule) return 0;
  const normalized = value.trim().replace(/\s+/g, " ");
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
    return sum + calcFieldSurcharge(values[f.id] ?? "", f, rule);
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
                      <Text as="p" variant="bodySm" tone="subdued">
                        Per-character price: ${rule.perCharPrice.toFixed(2)}
                      </Text>
                      {rule.charGroups.map((g) => (
                        <Text key={g.id} as="p" variant="bodySm" tone="subdued">
                          &nbsp;&nbsp;{g.label}: ${g.pricePerChar.toFixed(2)}
                        </Text>
                      ))}
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
  const savedPerCharPrice = rule?.perCharPrice?.toFixed(4) ?? "0.0000";
  const [perCharPrice, setPerCharPrice] = useState(savedPerCharPrice);
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

  // Report an unsaved per-character price up so the parent can guard tab switches (SL-68).
  // After a successful save the loader revalidates, rule.perCharPrice updates, and
  // savedPerCharPrice matches the input again — clearing dirty automatically.
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  // Compare numerically, not by string: after saving "2" the loader revalidates
  // rule.perCharPrice to 2 which formats back to "2.0000", so a raw string compare
  // would wrongly stay dirty and nag on every tab switch (SL-68 QA).
  const priceDirty = parseFloat(perCharPrice || "0") !== (rule?.perCharPrice ?? 0);
  useEffect(() => {
    onDirtyChangeRef.current?.(priceDirty);
  }, [priceDirty]);
  useEffect(() => () => onDirtyChangeRef.current?.(false), []);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h3" variant="headingSm">{field.label}</Text>
        <priceFetcher.Form method="post">
          <input type="hidden" name="_action" value="set_field_price" />
          <input type="hidden" name="fieldId" value={field.id} />
          <input type="hidden" name="perCharPrice" value={perCharPrice} />
          <InlineStack gap="300" blockAlign="end">
            <div style={{ width: "200px" }}>
              <TextField
                label="Price per character ($)"
                type="number"
                value={perCharPrice}
                onChange={setPerCharPrice}
                prefix="$"
                autoComplete="off"
              />
            </div>
            <Button submit loading={priceFetcher.state !== "idle"}>Save</Button>
          </InlineStack>
        </priceFetcher.Form>

        {rule?.charGroups?.length ? (
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

        {showAddGroup ? (
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
        ) : (
          <Button size="slim" onClick={() => setShowAddGroup(true)}>
            + Add character group
          </Button>
        )}
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

export default function ProductDetailPage() {
  const { product, published, fields, pricingRules, variantPrices, themeEditorDeepLink } = useLoaderData<typeof loader>();
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
                          <FieldForm actionType="create" onClose={handleAddClose} onDirtyChange={setFieldFormDirty} />
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
