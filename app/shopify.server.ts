import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

// Shopify deprecated non-expiring shpat_ tokens in Dec 2025. Any fresh OAuth
// install still gets one; this exchanges it for an expiring token immediately.
export async function migrateShpat(session: any): Promise<void> {
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

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "https://localhost:3000",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  webhooks: {
    // Mandatory compliance topics (customers/data_request, customers/redact,
    // shop/redact) are NOT registered here — Shopify ignores API-registered
    // subscriptions for them. They are declared in shopify.app.*.toml under
    // [[webhooks.subscriptions]] compliance_topics. See SL-69.
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      if (session.accessToken?.startsWith("shpat_")) {
        await migrateShpat(session).catch((err) => {
          console.error("[afterAuth] token migration failed:", err.message);
        });
      }
      shopify.registerWebhooks({ session }).catch((err) => {
        console.error("[afterAuth] webhook registration failed (non-fatal):", err.message);
      });

      // Cart Transform functions are not auto-activated on install — cartTransformCreate
      // must be called once per shop to register the function with checkout.
      try {
        const fnsRes = await admin.graphql(
          `{ shopifyFunctions(first: 25) { nodes { id apiType } } }`
        );
        const { data: fnsData } = await fnsRes.json();
        const fn = ((fnsData?.shopifyFunctions?.nodes ?? []) as { id: string; apiType: string }[]).find(
          (f) => f.apiType === "cart_transform"
        );
        if (!fn) {
          console.warn("[afterAuth] no cart_transform function found — is shopify app deploy done?");
        } else {
          console.log("[afterAuth] calling cartTransformCreate with functionId:", fn.id);
          const createRes = await admin.graphql(
            `mutation CartTransformCreate($functionId: String!) {
              cartTransformCreate(functionId: $functionId) {
                cartTransform { id }
                userErrors { field message }
              }
            }`,
            { variables: { functionId: fn.id } }
          );
          const { data: createData } = await createRes.json();
          const errs: { field: string[]; message: string }[] = createData?.cartTransformCreate?.userErrors ?? [];
          if (errs.length > 0) {
            console.log("[afterAuth] cartTransformCreate userErrors:", JSON.stringify(errs));
          } else {
            console.log("[afterAuth] cartTransformCreate activated:", createData?.cartTransformCreate?.cartTransform?.id);
          }
        }
      } catch (err) {
        console.error("[afterAuth] cartTransformCreate failed:", err);
      }

      // Cart and Checkout Validation functions are also not auto-activated —
      // validationCreate must be called once per shop to enable it at checkout.
      try {
        const validationRes = await admin.graphql(
          `mutation ValidationCreate($validation: ValidationCreateInput!) {
            validationCreate(validation: $validation) {
              validation { id }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              validation: {
                functionHandle: "etch-cart-validation",
                enable: true,
                blockOnFailure: false,
              },
            },
          }
        );
        const { data: validationData } = await validationRes.json();
        const validationErrs: { field: string[]; message: string }[] =
          validationData?.validationCreate?.userErrors ?? [];
        if (validationErrs.length > 0) {
          console.log("[afterAuth] validationCreate userErrors:", JSON.stringify(validationErrs));
        } else {
          console.log("[afterAuth] validationCreate activated:", validationData?.validationCreate?.validation?.id);
        }
      } catch (err) {
        console.error("[afterAuth] validationCreate failed:", err);
      }
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
