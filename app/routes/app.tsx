import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate, MONTHLY_PLAN } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);

  // Skip the billing check on the billing page itself to avoid redirect loops
  const url = new URL(request.url);
  if (url.pathname !== "/app/billing") {
    try {
      const { hasActivePayment } = await billing.check({
        plans: [MONTHLY_PLAN],
        isTest: process.env.NODE_ENV !== "production",
      });
      if (!hasActivePayment) {
        return redirect("/app/billing");
      }
    } catch (error) {
      // billing.check() can throw a raw Shopify API Response (JSON) on auth
      // errors, rate limits, etc. Never propagate it to the browser — redirect
      // to the billing page so the merchant sees a recoverable UI.
      console.error("[billing] check failed:", error);
      return redirect("/app/billing");
    }
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <a href="/app" rel="home">
          Home
        </a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs: { loaderHeaders: Headers }) => {
  return boundary.headers(headersArgs);
};
