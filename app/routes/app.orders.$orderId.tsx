import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useRouteError } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Banner,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { parseLineItemCustomization, formatMinor, dollarsToMinor } from "../utils/orderCustomization";
import type { LineItemBreakdown, LineItemCustomization } from "../utils/orderCustomization";
import { recordPriceMismatch } from "../utils/metrics";

const ORDER_QUERY = `
  query GetOrder($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      displayFinancialStatus
      displayFulfillmentStatus
      lineItems(first: 250) {
        edges {
          node {
            id
            title
            quantity
            variant { title product { id } }
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            customAttributes { key value }
            lineItemGroup { customAttributes { key value } }
          }
        }
      }
    }
  }
`;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const orderGid = `gid://shopify/Order/${params.orderId}`;

  const response = await admin.graphql(ORDER_QUERY, { variables: { id: orderGid } });
  const { data } = await response.json();

  if (!data?.order) {
    throw new Response("Order not found", { status: 404 });
  }

  const order = data.order;
  const lineItems = order.lineItems.edges.map(({ node }: any) => {
    const customization = parseLineItemCustomization([
      ...node.customAttributes,
      ...(node.lineItemGroup?.customAttributes ?? []),
    ]);

    // AC4/AC6 (SL-32): compare the last preview price against the price
    // actually charged at checkout and record the result.
    let priceMismatch = false;
    if (customization?.previewPriceMinor != null && node.originalUnitPriceSet?.shopMoney?.amount) {
      const chargedPriceMinor = dollarsToMinor(node.originalUnitPriceSet.shopMoney.amount);
      priceMismatch = customization.previewPriceMinor !== chargedPriceMinor;
      recordPriceMismatch(session.shop, {
        productId: node.variant?.product?.id ?? null,
        correlationId: customization.correlationId,
        previewPriceMinor: customization.previewPriceMinor,
        chargedPriceMinor,
      });
    }

    return {
      id: node.id,
      title: node.title,
      quantity: node.quantity,
      variantTitle: node.variant?.title ?? null,
      unitPrice: node.originalUnitPriceSet?.shopMoney ?? null,
      customization,
      priceMismatch,
    };
  });

  return json({
    order: {
      name: order.name as string,
      createdAt: order.createdAt as string,
      financialStatus: order.displayFinancialStatus as string,
      fulfillmentStatus: order.displayFulfillmentStatus as string,
    },
    lineItems: lineItems as Array<{
      id: string;
      title: string;
      quantity: number;
      variantTitle: string | null;
      unitPrice: { amount: string; currencyCode: string } | null;
      customization: LineItemCustomization | null;
      priceMismatch: boolean;
    }>,
  });
};

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Renders the base + per-character pricing breakdown attached to the line
// item at checkout (see SL-29 / etch-customization.js).
function BreakdownList({ breakdown }: { breakdown: LineItemBreakdown }) {
  const rows: string[] = [];

  if (breakdown.baseMinor > 0) {
    rows.push(`Base: ${formatMinor(breakdown.baseMinor)}`);
  }

  for (const field of breakdown.fields) {
    for (const group of field.groups) {
      if (group.charCount > 0) {
        rows.push(
          `${field.fieldLabel} — ${group.label} (${group.charCount}): ${formatMinor(group.subtotalMinor)}`
        );
      }
    }
    if (field.unmatchedCount > 0) {
      rows.push(
        `${field.fieldLabel} — Standard (${field.unmatchedCount}): ${formatMinor(field.unmatchedSubtotalMinor)}`
      );
    }
  }

  if (rows.length === 0) return null;

  return (
    <BlockStack gap="100">
      {rows.map((row, i) => (
        <Text as="span" variant="bodySm" tone="subdued" key={i}>
          {row}
        </Text>
      ))}
    </BlockStack>
  );
}

function CustomizationDetails({
  customization,
  priceMismatch,
}: {
  customization: LineItemCustomization;
  priceMismatch: boolean;
}) {
  return (
    <Box
      paddingBlockStart="300"
      paddingInlineStart="400"
      borderInlineStartWidth="025"
      borderColor="border"
    >
      <BlockStack gap="200">
        <InlineStack gap="200" blockAlign="center">
          <Badge tone="success">Customized</Badge>
          {priceMismatch && <Badge tone="critical">Price mismatch</Badge>}
          {customization.priceFormatted && (
            <Text as="span" variant="bodySm" fontWeight="semibold">
              Customization price: {customization.priceFormatted}
            </Text>
          )}
        </InlineStack>

        {customization.fieldValues.length > 0 && (
          <BlockStack gap="050">
            {customization.fieldValues.map((fv) => (
              <Text as="span" variant="bodySm" key={fv.label}>
                <Text as="span" fontWeight="semibold">{fv.label}:</Text> {fv.value}
              </Text>
            ))}
          </BlockStack>
        )}

        {customization.breakdown ? (
          <BreakdownList breakdown={customization.breakdown} />
        ) : (
          <Text as="span" variant="bodySm" tone="subdued">
            Pricing breakdown not available for orders placed before this feature shipped.
          </Text>
        )}

        {customization.ruleVersion && (
          <Text as="span" variant="bodySm" tone="subdued">
            Config version: {customization.ruleVersion}
          </Text>
        )}
      </BlockStack>
    </Box>
  );
}

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

export default function OrderDetailPage() {
  const { order, lineItems } = useLoaderData<typeof loader>();

  return (
    <Page
      title={order.name}
      backAction={{ content: "Orders", url: "/app/orders" }}
    >
      <BlockStack gap="400">
        <Card>
          <InlineStack gap="400" wrap>
            <Text as="span" variant="bodyMd">
              <Text as="span" fontWeight="semibold">Date:</Text> {order.createdAt.slice(0, 10)}
            </Text>
            <Badge>{formatStatus(order.financialStatus)}</Badge>
            <Badge>{formatStatus(order.fulfillmentStatus)}</Badge>
          </InlineStack>
        </Card>

        <Card padding="0">
          <BlockStack gap="0">
            {lineItems.map((item, index) => (
              <Box
                key={item.id}
                padding="400"
                borderBlockEndWidth={index === lineItems.length - 1 ? undefined : "025"}
                borderColor="border"
              >
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="start" gap="400">
                    <BlockStack gap="050">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {item.title}
                      </Text>
                      {item.variantTitle && item.variantTitle !== "Default Title" && (
                        <Text as="span" variant="bodySm" tone="subdued">
                          {item.variantTitle}
                        </Text>
                      )}
                    </BlockStack>
                    <BlockStack gap="050" inlineAlign="end">
                      <Text as="span" variant="bodySm" tone="subdued">
                        Qty: {item.quantity}
                      </Text>
                      {item.unitPrice && (
                        <Text as="span" variant="bodySm" tone="subdued">
                          {item.unitPrice.amount} {item.unitPrice.currencyCode}
                        </Text>
                      )}
                    </BlockStack>
                  </InlineStack>

                  {item.customization && (
                    <CustomizationDetails
                      customization={item.customization}
                      priceMismatch={item.priceMismatch}
                    />
                  )}
                </BlockStack>
              </Box>
            ))}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
