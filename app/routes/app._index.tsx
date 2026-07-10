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
import { authenticate } from "../shopify.server";
import { buildAppEmbedDeepLink } from "../utils/themeEditor";
import prisma from "../db.server";
import { useState, useEffect } from "react";

async function checkWidgetActivated(shop: string, accessToken: string): Promise<boolean> {
  const uuid = process.env.SHOPIFY_THEME_APP_EXTENSION_UUID;
  if (!uuid) return false;
  try {
    const themesRes = await fetch(`https://${shop}/admin/api/2024-01/themes.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    const themesData = (await themesRes.json()) as { themes: Array<{ id: number; role: string }> };
    const mainTheme = themesData.themes?.find((t) => t.role === "main");
    if (!mainTheme) return false;

    const assetRes = await fetch(
      `https://${shop}/admin/api/2024-01/themes/${mainTheme.id}/assets.json?asset[key]=config/settings_data.json`,
      { headers: { "X-Shopify-Access-Token": accessToken } }
    );
    const assetData = (await assetRes.json()) as { asset?: { value?: string } };
    const content = assetData.asset?.value;
    if (!content) return false;

    const settings = JSON.parse(content);
    // App embeds appear in current.blocks with shopify://app-blocks/{uuid}/{handle} keys or as block.type values
    const blocks: Record<string, unknown> = settings?.current?.blocks ?? {};
    return (
      Object.keys(blocks).some((k) => k.includes(uuid)) ||
      Object.values(blocks).some((b: any) => String(b?.type ?? "").includes(uuid))
    );
  } catch {
    return false;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [enabledCount, publishedCount, widgetActivated] = await Promise.all([
    prisma.productConfig.count({ where: { shop: session.shop, enabled: true } }),
    prisma.productConfig.count({ where: { shop: session.shop, published: true } }),
    checkWidgetActivated(session.shop, session.accessToken ?? ""),
  ]);

  const activateUrl =
    buildAppEmbedDeepLink({
      shop: session.shop,
      extensionUuid: process.env.SHOPIFY_THEME_APP_EXTENSION_UUID,
    }) ?? `https://${session.shop}/admin/themes/current/editor?context=apps`;

  return json({ enabledCount, publishedCount, widgetActivated, activateUrl, shop: session.shop });
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
  const { enabledCount, publishedCount, widgetActivated, activateUrl, shop } =
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
      done: enabledCount > 0 || publishedCount > 0,
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

            {publishedCount > 0 && (
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
                      <Text as="p" tone="subdued">Configured</Text>
                    </BlockStack>
                  </InlineStack>
                  <Box>
                    <Button url="/app/products" variant="primary">Manage products</Button>
                  </Box>
                </BlockStack>
              </Card>
            )}

            {publishedCount === 0 && !showGuide && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Get started</Text>
                  <Text as="p">Add customization fields to your products to start charging input-based pricing.</Text>
                  <Box>
                    <Button url="/app/products" variant="primary">Go to Products</Button>
                  </Box>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
