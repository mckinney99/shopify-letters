import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate, MONTHLY_PLAN } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  const { billing } = await authenticate.admin(request);

  // Skip billing check on the billing page itself to avoid redirect loops
  if (url.pathname !== "/app/billing") {
    try {
      const result = await billing.check({
        plans: [MONTHLY_PLAN],
        isTest: process.env.BILLING_IS_TEST !== "false",
      });
      if (!result.hasActivePayment) {
        return redirect(`/app/billing?${url.searchParams.toString()}`);
      }
    } catch {
      return redirect(`/app/billing?${url.searchParams.toString()}`);
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
        <a href="/app/products">Products</a>
        <a href="/app/orders">Orders</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
