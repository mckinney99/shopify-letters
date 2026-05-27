import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  return json({ shop: session.shop });
};

export default function Index() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <Page title="shopify-letters">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Banner title="Welcome to shopify-letters" tone="info">
              <Text as="p">
                Configure input-based pricing for your customizable products.
              </Text>
            </Banner>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Connected store
                </Text>
                <Text as="p" tone="subdued">
                  {shop}
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
