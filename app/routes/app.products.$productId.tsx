import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRouteError, Link } from "@remix-run/react";
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
} from "@shopify/polaris";
import { useEffect, useRef, useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { buildPricingConfig, computeConfigVersion } from "../utils/pricingConfig";

const PRODUCT_QUERY = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      title
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

type FieldData = {
  id: string;
  label: string;
  type: string;
  minChars: number | null;
  maxChars: number | null;
  allowedChars: string | null;
  disallowedChars: string | null;
  position: number;
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
    return "Cannot set both allowed and disallowed characters — choose one or neither.";
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

  return json({
    product: data.product as { id: string; title: string },
    published: config?.published ?? false,
    fields,
    pricingRules,
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
    const minChars = (form.get("minChars") as string) ?? "";
    const maxChars = (form.get("maxChars") as string) ?? "";
    const allowedChars = (form.get("allowedChars") as string) ?? "";
    const disallowedChars = (form.get("disallowedChars") as string) ?? "";

    const error = validateField({ label, minChars, maxChars, allowedChars, disallowedChars });
    if (error) return json({ error }, { status: 422 });

    const count = await prisma.customizationField.count({
      where: { shop, productId: productGid },
    });
    await prisma.customizationField.create({
      data: {
        shop,
        productId: productGid,
        label: label.trim(),
        type: "text",
        minChars: minChars ? parseInt(minChars) : null,
        maxChars: maxChars ? parseInt(maxChars) : null,
        allowedChars: allowedChars.trim() || null,
        disallowedChars: disallowedChars.trim() || null,
        position: count,
      },
    });
    await syncPricingMetafield(admin, shop, productGid);
    return json({ ok: true });
  }

  if (_action === "update") {
    const fieldId = form.get("fieldId") as string;
    const label = (form.get("label") as string) ?? "";
    const minChars = (form.get("minChars") as string) ?? "";
    const maxChars = (form.get("maxChars") as string) ?? "";
    const allowedChars = (form.get("allowedChars") as string) ?? "";
    const disallowedChars = (form.get("disallowedChars") as string) ?? "";

    const error = validateField({ label, minChars, maxChars, allowedChars, disallowedChars });
    if (error) return json({ error }, { status: 422 });

    await prisma.customizationField.updateMany({
      where: { id: fieldId, shop },
      data: {
        label: label.trim(),
        minChars: minChars ? parseInt(minChars) : null,
        maxChars: maxChars ? parseInt(maxChars) : null,
        allowedChars: allowedChars.trim() || null,
        disallowedChars: disallowedChars.trim() || null,
      },
    });
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

  if (_action === "set_base_price") {
    const basePrice = parseFloat((form.get("basePrice") as string) || "0") || 0;
    await prisma.pricingRule.upsert({
      where: { shop_productId_fieldId: { shop, productId: productGid, fieldId: "" } },
      update: { basePrice },
      create: { shop, productId: productGid, fieldId: "", basePrice },
    });
    await syncPricingMetafield(admin, shop, productGid);
    return json({ ok: true });
  }

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
}: {
  field?: FieldData;
  actionType: "create" | "update";
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [label, setLabel] = useState(field?.label ?? "");
  const [minChars, setMinChars] = useState(field?.minChars?.toString() ?? "");
  const [maxChars, setMaxChars] = useState(field?.maxChars?.toString() ?? "");
  const [allowedChars, setAllowedChars] = useState(field?.allowedChars ?? "");
  const [disallowedChars, setDisallowedChars] = useState(field?.disallowedChars ?? "");

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  return (
    <fetcher.Form method="post">
      <BlockStack gap="400">
        <input type="hidden" name="_action" value={actionType} />
        {field && <input type="hidden" name="fieldId" value={field.id} />}
        <input type="hidden" name="label" value={label} />
        <input type="hidden" name="minChars" value={minChars} />
        <input type="hidden" name="maxChars" value={maxChars} />
        <input type="hidden" name="allowedChars" value={allowedChars} />
        <input type="hidden" name="disallowedChars" value={disallowedChars} />
        {fetcher.data?.error && <Banner tone="critical">{fetcher.data.error}</Banner>}
        <FormLayout>
          <TextField label="Label" value={label} onChange={setLabel} autoComplete="off" requiredIndicator />
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
}: {
  field: FieldData;
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onEditClose: () => void;
}) {
  const moveFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  if (isEditing) {
    return (
      <Box padding="400" borderBlockEndWidth="025" borderColor="border">
        <FieldForm field={field} actionType="update" onClose={onEditClose} />
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

// ── Pricing components ────────────────────────────────────────────────────────

function BasePriceForm({ basePrice }: { basePrice: number }) {
  const fetcher = useFetcher<{ ok?: boolean }>();
  const [price, setPrice] = useState(basePrice.toFixed(2));

  return (
    <Card>
      <fetcher.Form method="post">
        <input type="hidden" name="_action" value="set_base_price" />
        <input type="hidden" name="basePrice" value={price} />
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Base price</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Fixed amount added to every order for this product, regardless of characters typed.
          </Text>
          <InlineStack gap="300" blockAlign="end">
            <div style={{ width: "200px" }}>
              <TextField
                label="Amount ($)"
                type="number"
                value={price}
                onChange={setPrice}
                prefix="$"
                autoComplete="off"
              />
            </div>
            <Button variant="primary" submit loading={fetcher.state !== "idle"}>Save</Button>
          </InlineStack>
        </BlockStack>
      </fetcher.Form>
    </Card>
  );
}

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
}: {
  field: FieldData;
  rule: PricingRuleData | undefined;
}) {
  const priceFetcher = useFetcher<{ ok?: boolean }>();
  const groupFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [perCharPrice, setPerCharPrice] = useState(rule?.perCharPrice?.toFixed(4) ?? "0.0000");
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
}: {
  fields: FieldData[];
  pricingRules: PricingRuleData[];
}) {
  const baseRule = pricingRules.find((r) => r.fieldId === "");
  const [previewText, setPreviewText] = useState("");

  const basePrice = baseRule?.basePrice ?? 0;
  const estimatedPrice =
    basePrice +
    fields.reduce((total, field) => {
      const rule = pricingRules.find((r) => r.fieldId === field.id);
      if (!rule) return total;
      const chars = [...previewText].slice(0, field.maxChars ?? previewText.length);
      return (
        total +
        chars.reduce((sum, char) => {
          const group = rule.charGroups.find((g) => g.characters.includes(char));
          return sum + (group ? group.pricePerChar : rule.perCharPrice);
        }, 0)
      );
    }, 0);

  return (
    <BlockStack gap="500">
      <BasePriceForm basePrice={baseRule?.basePrice ?? 0} />

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
            />
          ))}
        </BlockStack>
      )}

      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Live example</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Type sample text to see an estimated price based on your current rules.
          </Text>
          <TextField
            label="Sample input"
            value={previewText}
            onChange={setPreviewText}
            autoComplete="off"
            placeholder="e.g. Hello World"
          />
          <Text as="p" variant="bodyMd">
            Estimated price:{" "}
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              ${estimatedPrice.toFixed(2)}
            </Text>
            {previewText.length > 0 && (
              <Text as="span" variant="bodySm" tone="subdued">
                {" "}(base ${basePrice.toFixed(2)} + {previewText.length} char{previewText.length !== 1 ? "s" : ""})
              </Text>
            )}
          </Text>
        </BlockStack>
      </Card>
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
  const { product, published, fields, pricingRules } = useLoaderData<typeof loader>();
  const [selectedTab, setSelectedTab] = useState(0);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Onboarding guide state
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);
  const [fieldCalloutDismissed, setFieldCalloutDismissed] = useState(false);
  const [pricingCalloutDismissed, setPricingCalloutDismissed] = useState(false);
  const [publishCalloutDismissed, setPublishCalloutDismissed] = useState(false);

  useEffect(() => {
    setOnboardingComplete(localStorage.getItem("etch_onboarding_complete") === "1");
  }, []);

  const publishFetcher = useFetcher<{ ok?: boolean }>();
  const isPublishing = publishFetcher.state !== "idle";
  const optimisticPublished =
    isPublishing
      ? publishFetcher.formData?.get("published") === "true"
      : published;

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
            <BlockStack gap="200">
              <Text as="p">
                Your customers can now add custom text to this product and see the price update
                in real time. Etch will automatically apply the correct charge at checkout.
              </Text>
              <Text as="p">
                <Link to="/app/support"><b>Bookmark our Help &amp; Support page</b></Link> for
                tips, FAQs, and pricing ideas whenever you need them.
              </Text>
            </BlockStack>
          </Banner>
        )}

        {!onboardingComplete && !optimisticPublished && !publishCalloutDismissed && (
          <Banner
            title="Step 5 of 5 — Go live!"
            tone="info"
            onDismiss={() => setPublishCalloutDismissed(true)}
          >
            <Text as="p">
              Once you've added a field and set your pricing below, click the{" "}
              <b>Publish</b> button in the top-right corner. That's it — your custom
              pricing will go live on your storefront immediately. Your customers will see it the
              next time they view this product.
            </Text>
          </Banner>
        )}

      <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
        <Box paddingBlockStart="400">
          {selectedTab === 0 ? (
            <BlockStack gap="400">
              {!onboardingComplete && !fieldCalloutDismissed && (
                <Banner
                  title="Step 3 of 5 — Add a text field"
                  tone="info"
                  onDismiss={() => setFieldCalloutDismissed(true)}
                >
                  <BlockStack gap="200">
                    <Text as="p">
                      A <b>field</b> is a text box shown to your customer on the product page —
                      for example, "Enter your engraving text here" or "Monogram initials (max 3 letters)".
                      Etch will charge per character based on whatever your customer types in.
                    </Text>
                    <Text as="p"><b>Label</b> — the name of the input that your customer will see.</Text>
                    <Text as="p"><b>Min/Max characters</b> — optional limits on how long the input can be.</Text>
                    <Text as="p"><b>Allowed/Disallowed characters</b> — optionally restrict to certain letters or symbols.</Text>
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
                      />
                    ))}
                    {showAddForm && (
                      <Box padding="400">
                        <BlockStack gap="300">
                          <Text as="h3" variant="headingSm">New field</Text>
                          <FieldForm actionType="create" onClose={handleAddClose} />
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
              {!onboardingComplete && !pricingCalloutDismissed && (
                <Banner
                  title="Step 4 of 5 — Set your pricing"
                  tone="info"
                  onDismiss={() => setPricingCalloutDismissed(true)}
                >
                  <BlockStack gap="200">
                    <Text as="p">
                      <b>Base price</b> — a flat fee added to every order for this product, no matter how
                      many characters the customer types. Use this if there's a fixed setup cost
                      (e.g. $5.00 for any engraving job).
                    </Text>
                    <Text as="p">
                      <b>Per-character price</b> — charged for each character the customer types.
                      For example, at $0.50/char, the word "Hello" (5 characters) adds $2.50 to the cart.
                    </Text>
                    <Text as="p">
                      <b>Character groups</b> (optional) — charge a different price for specific
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
              <PricingTab fields={fields} pricingRules={pricingRules} />
            </BlockStack>
          )}
        </Box>
      </Tabs>
      </BlockStack>
    </Page>
  );
}
