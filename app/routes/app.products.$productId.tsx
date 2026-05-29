import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
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
} from "@shopify/polaris";
import { useEffect, useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PRODUCT_QUERY = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      title
    }
  }
`;

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

  const [productRes, fields] = await Promise.all([
    admin.graphql(PRODUCT_QUERY, { variables: { id: productGid } }),
    prisma.customizationField.findMany({
      where: { shop: session.shop, productId: productGid },
      orderBy: { position: "asc" },
    }),
  ]);

  const { data } = await productRes.json();
  if (!data?.product) {
    throw new Response("Product not found", { status: 404 });
  }

  return json({
    product: data.product as { id: string; title: string },
    fields,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const _action = form.get("_action") as string;
  const productGid = `gid://shopify/Product/${params.productId}`;
  const shop = session.shop;

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

    // updateMany scopes to shop to prevent cross-shop writes
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

    return json({ ok: true });
  }

  if (_action === "delete") {
    const fieldId = form.get("fieldId") as string;
    await prisma.customizationField.deleteMany({ where: { id: fieldId, shop } });
    // Compact positions after deletion
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

  return json({ error: "Unknown action" }, { status: 400 });
};

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

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      onClose();
    }
  }, [fetcher.state, fetcher.data, onClose]);

  return (
    <fetcher.Form method="post">
      <BlockStack gap="400">
        <input type="hidden" name="_action" value={actionType} />
        {field && <input type="hidden" name="fieldId" value={field.id} />}
        {fetcher.data?.error && (
          <Banner tone="critical">{fetcher.data.error}</Banner>
        )}
        <FormLayout>
          <TextField
            label="Label"
            name="label"
            defaultValue={field?.label ?? ""}
            autoComplete="off"
            requiredIndicator
          />
          <FormLayout.Group>
            <TextField
              label="Min characters"
              name="minChars"
              type="number"
              defaultValue={field?.minChars?.toString() ?? ""}
              autoComplete="off"
            />
            <TextField
              label="Max characters"
              name="maxChars"
              type="number"
              defaultValue={field?.maxChars?.toString() ?? ""}
              autoComplete="off"
            />
          </FormLayout.Group>
          <FormLayout.Group>
            <TextField
              label="Allowed characters"
              name="allowedChars"
              helpText="Only these characters will be accepted (leave blank for all)"
              defaultValue={field?.allowedChars ?? ""}
              autoComplete="off"
            />
            <TextField
              label="Disallowed characters"
              name="disallowedChars"
              helpText="These characters will be rejected (leave blank to allow all)"
              defaultValue={field?.disallowedChars ?? ""}
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
      <Box
        padding="400"
        borderBlockEndWidth="025"
        borderColor="border"
      >
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
    <Box
      padding="400"
      borderBlockEndWidth="025"
      borderColor="border"
    >
      <InlineStack align="space-between" blockAlign="center" gap="400">
        <BlockStack gap="100">
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {field.label}
          </Text>
          {charInfo.length > 0 && (
            <Text as="span" variant="bodySm" tone="subdued">
              {charInfo.join(" · ")}
            </Text>
          )}
        </BlockStack>
        <InlineStack gap="200" blockAlign="center">
          <moveFetcher.Form method="post" style={{ display: "inline" }}>
            <input type="hidden" name="_action" value="move_up" />
            <input type="hidden" name="fieldId" value={field.id} />
            <Button
              submit
              disabled={isFirst || moveFetcher.state !== "idle"}
              size="slim"
              accessibilityLabel="Move up"
            >
              ↑
            </Button>
          </moveFetcher.Form>
          <moveFetcher.Form method="post" style={{ display: "inline" }}>
            <input type="hidden" name="_action" value="move_down" />
            <input type="hidden" name="fieldId" value={field.id} />
            <Button
              submit
              disabled={isLast || moveFetcher.state !== "idle"}
              size="slim"
              accessibilityLabel="Move down"
            >
              ↓
            </Button>
          </moveFetcher.Form>
          <Button size="slim" onClick={onEdit}>
            Edit
          </Button>
          <deleteFetcher.Form method="post" style={{ display: "inline" }}>
            <input type="hidden" name="_action" value="delete" />
            <input type="hidden" name="fieldId" value={field.id} />
            <Button
              submit
              tone="critical"
              size="slim"
              loading={deleteFetcher.state !== "idle"}
            >
              Delete
            </Button>
          </deleteFetcher.Form>
        </InlineStack>
      </InlineStack>
    </Box>
  );
}

export default function ProductFieldsPage() {
  const { product, fields } = useLoaderData<typeof loader>();
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

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

  return (
    <Page
      title={product.title}
      backAction={{ content: "Products", url: "/app/products" }}
    >
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
                  <Text as="h3" variant="headingSm">
                    New field
                  </Text>
                  <FieldForm
                    actionType="create"
                    onClose={handleAddClose}
                  />
                </BlockStack>
              </Box>
            )}
          </>
        )}
      </Card>

      {!showAddForm && fields.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <Button onClick={handleAddOpen} variant="primary">
            Add field
          </Button>
        </div>
      )}
    </Page>
  );
}
