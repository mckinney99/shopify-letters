import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

// Shopify deprecated non-expiring shpat_ tokens in Dec 2025. Any fresh OAuth
// install still gets one; this exchanges it for an expiring token immediately.
async function migrateShpat(session: any): Promise<void> {
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY!,
    client_secret: process.env.SHOPIFY_API_SECRET!,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: session.accessToken,
    subject_token_type:
      "urn:shopify:params:oauth:token-type:offline-access-token",
    requested_token_type:
      "urn:shopify:params:oauth:token-type:offline-access-token",
    expiring: "1",
  });

  const res = await fetch(
    `https://${session.shop}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    }
  );

  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`shpat_ migration failed: ${JSON.stringify(body)}`);
  }

  const expires = body.expires_in
    ? new Date(Date.now() + body.expires_in * 1000)
    : null;

  // Mutate so registerWebhooks (called right after) uses the new token.
  session.accessToken = body.access_token;
  session.expires = expires;

  await prisma.session.update({
    where: { id: session.id },
    data: { accessToken: body.access_token, expires },
  });

  console.log(
    `[afterAuth] shpat_ migrated — expires ${expires?.toISOString() ?? "never"}`
  );
}

export const MONTHLY_PLAN = "Monthly subscription";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "https://localhost:3000",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [MONTHLY_PLAN]: {
      lineItems: [
        {
          amount: 4.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
      trialDays: Number(process.env.BILLING_TRIAL_DAYS || 7),
    },
  },
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      if (session.accessToken?.startsWith("shpat_")) {
        await migrateShpat(session).catch((err) => {
          console.error("[afterAuth] token migration failed:", err.message);
        });
      }
      shopify.registerWebhooks({ session }).catch((err) => {
        console.error("[afterAuth] webhook registration failed (non-fatal):", err.message);
      });
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
