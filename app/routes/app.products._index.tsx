import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link, useRouteError } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Thumbnail,
  Badge,
  Banner,
  useIndexResourceState,
  EmptyState,
  Pagination,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PAGE_SIZE = 20;

// GraphQL fragments kept minimal — only fetch what the UI needs.
const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          featuredImage {
            url
            altText
          }
          status
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

const PRODUCTS_PREV_QUERY = `
  query GetProductsPrev($last: Int!, $before: String) {
    products(last: $last, before: $before) {
      edges {
        node {
          id
          title
          handle
          featuredImage {
            url
            altText
          }
          status
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
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const after = url.searchParams.get("after") ?? undefined;
  const before = url.searchParams.get("before") ?? undefined;

  const query = before ? PRODUCTS_PREV_QUERY : PRODUCTS_QUERY;
  const variables = before
    ? { last: PAGE_SIZE, before }
    : { first: PAGE_SIZE, after };

  const response = await admin.graphql(query, { variables });
  const { data } = await response.json();
  const { edges, pageInfo } = data.products;

  const productIds = edges.map((e: { node: { id: string } }) => e.node.id);

  const configs = await prisma.productConfig.findMany({
    where: { shop: session.shop, productId: { in: productIds } },
    select: { productId: true, enabled: true, published: true },
  });

  const configMap = new Map(configs.map((c) => [c.productId, c]));

  const products = edges.map(({ node }: { node: any }) => ({
    id: node.id,
    numericId: node.id.split("/").pop() as string,
    title: node.title,
    handle: node.handle,
    status: node.status,
    imageUrl: node.featuredImage?.url ?? null,
    imageAlt: node.featuredImage?.altText ?? node.title,
    enabled: configMap.get(node.id)?.enabled ?? false,
    published: configMap.get(node.id)?.published ?? false,
  }));

  return json({ products, pageInfo });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const productId = form.get("productId") as string;
  const enabled = form.get("enabled") === "true";

  await prisma.productConfig.upsert({
    where: { shop_productId: { shop: session.shop, productId } },
    update: { enabled },
    create: { shop: session.shop, productId, enabled },
  });

  return json({ ok: true });
};

function ToggleButton({
  productId,
  enabled,
}: {
  productId: string;
  enabled: boolean;
}) {
  const fetcher = useFetcher();
  // Optimistic: flip immediately, revert on error if needed
  const optimisticEnabled =
    fetcher.state !== "idle"
      ? fetcher.formData?.get("enabled") === "true"
      : enabled;

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="productId" value={productId} />
      <input
        type="hidden"
        name="enabled"
        value={String(!optimisticEnabled)}
      />
      <button
        type="submit"
        className={`product-toggle ${optimisticEnabled ? "product-toggle--on" : "product-toggle--off"}`}
      >
        {optimisticEnabled ? "Enabled" : "Disabled"}
      </button>
    </fetcher.Form>
  );
}

// Persists across remounts within the same SPA session (resets on hard refresh).
let step2Dismissed = false;

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

export default function ProductsPage() {
  const { products, pageInfo } = useLoaderData<typeof loader>();
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  // Module-level flag persists dismissed state across SPA navigation within the session.
  const [guideVisible, setGuideVisible] = useState(() => !step2Dismissed);

  useEffect(() => {
    setOnboardingComplete(localStorage.getItem("etch_onboarding_complete") === "1");
  }, []);

  const showGuide = !onboardingComplete && guideVisible;

  return (
    <Page title="Products">
      {showGuide && (
        <div style={{ marginBottom: "16px" }}>
          <Banner
            title="Step 2 of 5: Pick a product to set up"
            tone="info"
            onDismiss={() => { step2Dismissed = true; setGuideVisible(false); }}
          >
            <Text as="p">
              This is your list of Shopify products. Click any <b>product name</b> in the table below
              to open it and add custom pricing. It only takes a couple of minutes.
              You'll be guided through every step.
            </Text>
          </Banner>
        </div>
      )}
      <Card padding="0">
        {products.length === 0 ? (
          <EmptyState
            heading="No products found"
            image=""
          >
            <Text as="p">Add products to your Shopify store to configure customization.</Text>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: "product", plural: "products" }}
            itemCount={products.length}
            headings={[
              { title: "Product" },
              { title: "Status" },
              { title: "Customization" },
              { title: "Published" },
              { title: "Fields" },
            ]}
            selectable={false}
          >
            {products.map((product: any, index: number) => (
              <IndexTable.Row id={product.id} key={product.id} position={index}>
                <IndexTable.Cell>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <Thumbnail
                      source={product.imageUrl ?? ImageIcon}
                      alt={product.imageAlt}
                      size="small"
                    />
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {product.title}
                    </Text>
                  </div>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge
                    tone={product.status === "ACTIVE" ? "success" : "info"}
                  >
                    {product.status.charAt(0) + product.status.slice(1).toLowerCase()}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <ToggleButton
                    productId={product.id}
                    enabled={product.enabled}
                  />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={product.published ? "success" : "new"}>
                    {product.published ? "Published" : "Draft"}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Link to={`/app/products/${product.numericId}`}>Add custom pricing</Link>
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
              window.location.href = `/app/products?before=${pageInfo.startCursor}`;
            }}
            hasNext={pageInfo.hasNextPage}
            onNext={() => {
              window.location.href = `/app/products?after=${pageInfo.endCursor}`;
            }}
          />
        </div>
      )}
    </Page>
  );
}
