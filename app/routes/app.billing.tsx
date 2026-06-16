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

  // Decode the Shopify host param (base64 → "admin.shopify.com/store/STORE") so
  // after billing consent Shopify returns the merchant to the embedded app URL
  // instead of a bare localhost URL that has no embedded context.
  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const decodedHost = host
    ? Buffer.from(host.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
    : null;
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "etch";
  const returnUrl = decodedHost
    ? `https://${decodedHost}/apps/${appHandle}`
    : `${process.env.SHOPIFY_APP_URL || "https://localhost:3000"}/app`;

  // isTest=true until the app is listed on the Shopify App Store and billing is
  // approved for real transactions. Override via BILLING_IS_TEST=false in ECS.
  const isTest = process.env.BILLING_IS_TEST !== "false";

  try {
    // billing.request() throws a Response (redirect) on success — let Remix handle it.
    await billing.request({
      plan: MONTHLY_PLAN,
      isTest,
      returnUrl,
    });
  } catch (err) {
    // Re-throw Remix redirect Responses unchanged; log actual errors.
    if (err instanceof Response) throw err;
    console.error("[billing] billing.request() failed:", err);
    throw err;
  }
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
