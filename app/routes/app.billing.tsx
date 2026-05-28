import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  Box,
} from "@shopify/polaris";
import { authenticate, MONTHLY_PLAN } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({ trialDays: Number(process.env.BILLING_TRIAL_DAYS || 7) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  await billing.request({
    plan: MONTHLY_PLAN,
    isTest: process.env.NODE_ENV !== "production",
    returnUrl: `${process.env.SHOPIFY_APP_URL || "https://localhost:3000"}/app`,
  });
};

export default function BillingPage() {
  const { trialDays } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";

  return (
    <Page title="Subscription Required">
      <Card>
        <BlockStack gap="400">
          <Banner title="Your free trial has ended" tone="warning">
            <Text as="p">
              Subscribe to continue using Etch and access all features.
            </Text>
          </Banner>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Monthly Plan — $4.99/month
            </Text>
            <Text as="p" tone="subdued">
              Includes a {trialDays}-day free trial. Cancel any time from your
              Shopify admin.
            </Text>
          </BlockStack>
          <Box>
            <fetcher.Form method="post">
              <Button submit loading={isLoading} variant="primary">
                Start free trial
              </Button>
            </fetcher.Form>
          </Box>
        </BlockStack>
      </Card>
    </Page>
  );
}
