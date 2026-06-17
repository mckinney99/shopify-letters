import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
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
  if (process.env.DISABLE_BILLING === "true") {
    return redirect("/app");
  }
  return json({ trialDays: Number(process.env.BILLING_TRIAL_DAYS || 14) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);

  // isTest=true until the app is listed on the Shopify App Store and billing is
  // approved for real transactions. Override via BILLING_IS_TEST=false in ECS.
  const isTest = process.env.BILLING_IS_TEST !== "false";

  try {
    // billing.request() throws a Response (redirect) on success — let Remix handle it.
    // No explicit returnUrl: the library builds the correct embedded app URL using
    // config.apiKey (the client ID), which is what Shopify Admin expects at
    // /admin/apps/{apiKey}. Passing a named handle caused 404s.
    await billing.request({
      plan: MONTHLY_PLAN,
      isTest,
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
              Monthly Plan — $9.99/month
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
