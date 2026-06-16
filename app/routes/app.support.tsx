import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Link,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Support() {
  return (
    <Page title="Help & Support">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Contact support
                </Text>
                <Text as="p" tone="subdued">
                  For billing questions, bug reports, or feature requests, email
                  us and we&apos;ll respond within one business day.
                </Text>
                <Text as="p">
                  <Link url="mailto:support@etch.direct" target="_blank">
                    support@etch.direct
                  </Link>
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Privacy policy
                </Text>
                <Text as="p" tone="subdued">
                  Our privacy policy explains what data Etch stores and how GDPR
                  requests are handled.
                </Text>
                <Text as="p">
                  <Link url="https://etch.direct/privacy" target="_blank">
                    https://etch.direct/privacy
                  </Link>
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  About Etch
                </Text>
                <Divider />
                <BlockStack gap="200">
                  <Text as="p" tone="subdued">
                    Etch lets you charge customers based on what they type —
                    configurable per-character pricing for engraving, monogramming,
                    or any text-based customization.
                  </Text>
                  <Text as="p" tone="subdued">
                    Pricing rules are applied at checkout automatically via
                    Shopify&apos;s Cart Transform API. No code required on the
                    storefront.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
