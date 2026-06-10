import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  EmptyState,
  Pagination,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { parseLineItemCustomization } from "../utils/orderCustomization";

const PAGE_SIZE = 20;

const ORDERS_QUERY = `
  query GetOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          customer { displayName }
          lineItems(first: 50) {
            edges { node { customAttributes { key value } } }
          }
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

const ORDERS_PREV_QUERY = `
  query GetOrdersPrev($last: Int!, $before: String) {
    orders(last: $last, before: $before, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          customer { displayName }
          lineItems(first: 50) {
            edges { node { customAttributes { key value } } }
          }
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const after = url.searchParams.get("after") ?? undefined;
  const before = url.searchParams.get("before") ?? undefined;

  const query = before ? ORDERS_PREV_QUERY : ORDERS_QUERY;
  const variables = before
    ? { last: PAGE_SIZE, before }
    : { first: PAGE_SIZE, after };

  const response = await admin.graphql(query, { variables });
  const { data } = await response.json();
  const { edges, pageInfo } = data.orders;

  const orders = edges.map(({ node }: { node: any }) => {
    const hasCustomization = node.lineItems.edges.some(
      ({ node: li }: { node: { customAttributes: { key: string; value: string }[] } }) =>
        parseLineItemCustomization(li.customAttributes) !== null
    );

    return {
      id: node.id,
      numericId: node.id.split("/").pop() as string,
      name: node.name,
      createdAt: node.createdAt,
      financialStatus: node.displayFinancialStatus,
      fulfillmentStatus: node.displayFulfillmentStatus,
      customerName: node.customer?.displayName ?? "—",
      hasCustomization,
    };
  });

  return json({ orders, pageInfo });
};

function statusTone(status: string): "success" | "info" | "warning" | "critical" {
  switch (status) {
    case "PAID":
    case "FULFILLED":
      return "success";
    case "PARTIALLY_PAID":
    case "PARTIALLY_FULFILLED":
    case "PENDING":
      return "warning";
    case "REFUNDED":
    case "VOIDED":
      return "critical";
    default:
      return "info";
  }
}

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function OrdersPage() {
  const { orders, pageInfo } = useLoaderData<typeof loader>();

  return (
    <Page title="Orders">
      <Card padding="0">
        {orders.length === 0 ? (
          <EmptyState heading="No orders found" image="">
            <Text as="p">Orders placed in your store will show up here.</Text>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: "order", plural: "orders" }}
            itemCount={orders.length}
            headings={[
              { title: "Order" },
              { title: "Date" },
              { title: "Customer" },
              { title: "Payment" },
              { title: "Fulfillment" },
              { title: "Customization" },
            ]}
            selectable={false}
          >
            {orders.map((order, index) => (
              <IndexTable.Row id={order.id} key={order.id} position={index}>
                <IndexTable.Cell>
                  <Link to={`/app/orders/${order.numericId}`}>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {order.name}
                    </Text>
                  </Link>
                </IndexTable.Cell>
                <IndexTable.Cell>{order.createdAt.slice(0, 10)}</IndexTable.Cell>
                <IndexTable.Cell>{order.customerName}</IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={statusTone(order.financialStatus)}>
                    {formatStatus(order.financialStatus)}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={statusTone(order.fulfillmentStatus)}>
                    {formatStatus(order.fulfillmentStatus)}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {order.hasCustomization ? (
                    <Badge tone="success">Customized</Badge>
                  ) : (
                    <Text as="span" tone="subdued">—</Text>
                  )}
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>

      {(pageInfo.hasNextPage || pageInfo.hasPreviousPage) && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: "16px" }}>
          <Pagination
            hasPrevious={pageInfo.hasPreviousPage}
            onPrevious={() => {
              window.location.href = `/app/orders?before=${pageInfo.startCursor}`;
            }}
            hasNext={pageInfo.hasNextPage}
            onNext={() => {
              window.location.href = `/app/orders?after=${pageInfo.endCursor}`;
            }}
          />
        </div>
      )}
    </Page>
  );
}
