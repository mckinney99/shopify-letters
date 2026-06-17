import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Banner,
  Button,
  Box,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [totalCount, enabledCount, publishedCount] = await Promise.all([
    prisma.productConfig.count({ where: { shop: session.shop } }),
    prisma.productConfig.count({ where: { shop: session.shop, enabled: true } }),
    prisma.productConfig.count({ where: { shop: session.shop, published: true } }),
  ]);
  return json({ totalCount, enabledCount, publishedCount });
};

export default function Index() {
  const { totalCount, enabledCount, publishedCount } = useLoaderData<typeof loader>();

  if (publishedCount === 0) {
    return (
      <Page title="Welcome to Etch">
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">What is Etch?</Text>
                  <Text as="p">
                    Etch lets you charge customers based on what they type — perfect for engraving,
                    monogramming, embroidery, and any product with personalised text. Set a price per
                    character and Etch automatically adds the right amount to the cart total.
                  </Text>
                  <Divider />
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">How to get set up (takes about 2 minutes):</Text>
                    <BlockStack gap="100">
                      <Text as="p"><b>1. Pick a product</b> — choose any product from your Shopify store</Text>
                      <Text as="p"><b>2. Add a text field</b> — tell Etch what your customer will type (e.g. "Enter engraving text")</Text>
                      <Text as="p"><b>3. Set your pricing</b> — choose a flat fee and/or a price per character typed</Text>
                      <Text as="p"><b>4. Publish</b> — go live on your storefront instantly, no code required</Text>
                    </BlockStack>
                  </BlockStack>
                  <Box>
                    <Button url="/app/products" variant="primary">Go to Products</Button>
                  </Box>
                </BlockStack>
              </Card>
              <Banner title="Step 1 of 5 — Head to Products" tone="info">
                <Text as="p">
                  Click <b>Products</b> in the left navigation bar to see your Shopify products.
                  You'll pick one to add custom pricing to it — don't worry, you can do as many as you like later.
                </Text>
              </Banner>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Etch">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Your products</Text>
              <InlineStack gap="800">
                <BlockStack gap="100">
                  <Text as="p" variant="headingXl" fontWeight="bold">{publishedCount}</Text>
                  <Text as="p" tone="subdued">Published</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="headingXl" fontWeight="bold">{enabledCount}</Text>
                  <Text as="p" tone="subdued">Enabled</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="headingXl" fontWeight="bold">{totalCount}</Text>
                  <Text as="p" tone="subdued">Configured</Text>
                </BlockStack>
              </InlineStack>
              <Box>
                <Button url="/app/products" variant="primary">Add custom pricing</Button>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
