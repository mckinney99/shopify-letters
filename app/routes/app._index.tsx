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
  Button,
  Box,
  ProgressBar,
  Icon,
  Divider,
  Badge,
} from "@shopify/polaris";
import { CheckCircleIcon, MinusCircleIcon } from "@shopify/polaris-icons";
import { authenticate, apiVersion } from "../shopify.server";
import { buildAppEmbedDeepLink, isEtchEmbedEnabled } from "../utils/themeEditor";
import { logEvent, shortHash } from "../utils/log";
import prisma from "../db.server";
import { useState, useEffect } from "react";

// Detects whether the Etch app embed is enabled on the merchant's main theme.
// Fetches config/settings_data.json and delegates the (unit-tested) decision to
// isEtchEmbedEnabled. Failures are logged with a stage so a merchant report of
// "the step won't complete" can be diagnosed instead of silently returning false. SL-109.
async function checkWidgetActivated(shop: string, accessToken: string): Promise<boolean> {
  const fail = (stage: string, extra: Record<string, unknown> = {}) => {
    logEvent("widget_activation_check_failed", { shop: shortHash(shop), stage, ...extra });
    return false;
  };
  try {
    const themesRes = await fetch(`https://${shop}/admin/api/${apiVersion}/themes.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!themesRes.ok) return fail("themes_fetch", { status: themesRes.status });
    const themesData = (await themesRes.json()) as { themes?: Array<{ id: number; role: string }> };
    const mainTheme = themesData.themes?.find((t) => t.role === "main");
    if (!mainTheme) return fail("no_main_theme");

    const assetRes = await fetch(
      `https://${shop}/admin/api/${apiVersion}/themes/${mainTheme.id}/assets.json?asset[key]=config/settings_data.json`,
      { headers: { "X-Shopify-Access-Token": accessToken } }
    );
    if (!assetRes.ok) return fail("asset_fetch", { status: assetRes.status });
    const assetData = (await assetRes.json()) as { asset?: { value?: string } };
    const content = assetData.asset?.value;
    if (!content) return fail("no_settings_content");

    let settings: unknown;
    try {
      settings = JSON.parse(content);
    } catch {
      return fail("settings_parse");
    }
    return isEtchEmbedEnabled(settings, process.env.SHOPIFY_THEME_APP_EXTENSION_UUID);
  } catch (err) {
    return fail("exception", { error: err instanceof Error ? err.message : String(err) });
  }
}

async function fetchTotalProductCount(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  shop: string
): Promise<number> {
  try {
    const response = await admin.graphql(`#graphql
      query ProductsCount {
        productsCount {
          count
        }
      }
    `);
    const { data, errors } = (await response.json()) as {
      data?: { productsCount?: { count?: number } };
      errors?: unknown;
    };
    if (errors) {
      logEvent("products_count_fetch_failed", { shop: shortHash(shop), stage: "graphql_errors", errors });
      return 0;
    }
    return data?.productsCount?.count ?? 0;
  } catch (err) {
    logEvent("products_count_fetch_failed", {
      shop: shortHash(shop),
      stage: "exception",
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

async function fetchDraftCount(shop: string): Promise<number> {
  const [configuredFields, publishedConfigs] = await Promise.all([
    prisma.customizationField.findMany({
      where: { shop },
      distinct: ["productId"],
      select: { productId: true },
    }),
    prisma.productConfig.findMany({
      where: { shop, published: true },
      select: { productId: true },
    }),
  ]);
  const publishedProductIds = new Set(publishedConfigs.map((c) => c.productId));
  return configuredFields.filter((f) => !publishedProductIds.has(f.productId)).length;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const [totalProductCount, publishedCount, draftCount, widgetActivated] = await Promise.all([
    fetchTotalProductCount(admin, session.shop),
    prisma.productConfig.count({ where: { shop: session.shop, published: true } }),
    fetchDraftCount(session.shop),
    checkWidgetActivated(session.shop, session.accessToken ?? ""),
  ]);

  const activateUrl =
    buildAppEmbedDeepLink({
      shop: session.shop,
      extensionUuid: process.env.SHOPIFY_THEME_APP_EXTENSION_UUID,
    }) ?? `https://${session.shop}/admin/themes/current/editor?context=apps`;

  return json({
    totalProductCount,
    publishedCount,
    draftCount,
    widgetActivated,
    activateUrl,
    shop: session.shop,
  });
};

type StepRowProps = {
  done: boolean;
  title: string;
  description: string;
  actionLabel: string;
  actionUrl: string;
  external?: boolean;
};

function StepRow({ done, title, description, actionLabel, actionUrl, external }: StepRowProps) {
  return (
    <InlineStack gap="400" align="start" blockAlign="start" wrap={false}>
      <Box minWidth="24px" paddingBlockStart="050">
        <Icon
          source={done ? CheckCircleIcon : MinusCircleIcon}
          tone={done ? "success" : "subdued"}
        />
      </Box>
      <BlockStack gap="100">
        <InlineStack gap="200" blockAlign="center">
          <Text as="p" fontWeight={done ? "regular" : "semibold"} tone={done ? "subdued" : undefined}>
            {title}
          </Text>
          {done && <Badge tone="success">Done</Badge>}
        </InlineStack>
        {!done && (
          <>
            <Text as="p" tone="subdued">{description}</Text>
            <Box paddingBlockStart="100">
              <Button url={actionUrl} target={external ? "_blank" : undefined} variant="primary" size="slim">
                {actionLabel}
              </Button>
            </Box>
          </>
        )}
      </BlockStack>
    </InlineStack>
  );
}

const DISMISSED_KEY = "etch_setup_guide_dismissed";

export default function Index() {
  const { totalProductCount, publishedCount, draftCount, widgetActivated, activateUrl, shop } =
    useLoaderData<typeof loader>();

  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
  }, []);

  const steps = [
    {
      done: widgetActivated,
      title: "Activate the Etch widget in your theme",
      description: 'In the theme editor, go to App embeds and toggle "Etch Customization" on — one click and you\'re live.',
      actionLabel: "Activate widget",
      actionUrl: activateUrl,
      external: true,
    },
    {
      done: draftCount > 0 || publishedCount > 0,
      title: "Add customization to a product",
      description: "Pick a product and add a text field, dropdown, or other input.",
      actionLabel: "Go to Products",
      actionUrl: "/app/products",
    },
    {
      done: publishedCount > 0,
      title: "Preview it on your store",
      description: "Publish a configured product and open it on your storefront to see Etch in action.",
      actionLabel: "View store",
      actionUrl: `https://${shop}`,
      external: true,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const pendingSteps = steps.filter((s) => !s.done);
  const showGuide = !dismissed;

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  return (
    <Page title="Etch">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {showGuide && (
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Setup guide</Text>
                    <Text as="p" tone="subdued">{doneCount} of {steps.length} complete</Text>
                  </InlineStack>
                  <ProgressBar progress={(doneCount / steps.length) * 100} size="small" tone="success" />
                  {allDone ? (
                    <BlockStack gap="200">
                      <Text as="p" fontWeight="semibold" tone="success">You're all set!</Text>
                      <Text as="p" tone="subdued">Etch is active and your first product is configured. Customers can now personalize on your storefront.</Text>
                      <Box paddingBlockStart="100">
                        <Button onClick={handleDismiss} variant="plain">Dismiss guide</Button>
                      </Box>
                    </BlockStack>
                  ) : (
                    <BlockStack gap="400">
                      {pendingSteps.map((step, i) => (
                        <Box key={step.title}>
                          {i > 0 && <Box paddingBlockEnd="400"><Divider /></Box>}
                          <StepRow {...step} />
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Your products</Text>
                <InlineStack gap="800" wrap>
                  <BlockStack gap="100">
                    <Text as="p" variant="headingXl" fontWeight="bold">{totalProductCount}</Text>
                    <Text as="p" tone="subdued">Total products</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="headingXl" fontWeight="bold">{publishedCount}</Text>
                    <Text as="p" tone="subdued">Customized Etch products (live)</Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="headingXl" fontWeight="bold">{draftCount}</Text>
                    <Text as="p" tone="subdued">Draft Etch products</Text>
                  </BlockStack>
                </InlineStack>
                <Box>
                  <Button url="/app/products" variant="primary">Manage products</Button>
                </Box>
                <Divider />
                <InlineStack gap="300" wrap>
                  <Button url="/app/orders" variant="tertiary">Orders</Button>
                  <Button url="/app/assets" variant="tertiary">Assets</Button>
                  <Button url="/app/support" variant="tertiary">Support</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
