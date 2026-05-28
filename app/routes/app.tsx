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
  const url = new URL(request.url);
  console.log(`[app.tsx] loader: ${request.method} ${url.pathname}`);

  const { billing } = await authenticate.admin(request);
  console.log("[app.tsx] auth ok");

  // Skip the billing check on the billing page itself to avoid redirect loops
  if (url.pathname !== "/app/billing") {
    console.log("[billing] calling check...");
    try {
      const result = await billing.check({
        plans: [MONTHLY_PLAN],
        isTest: process.env.NODE_ENV !== "production",
      });
      console.log("[billing] hasActivePayment:", result.hasActivePayment);
      if (!result.hasActivePayment) {
        console.log("[billing] redirecting to /app/billing");
        return redirect("/app/billing");
      }
    } catch (error) {
      console.error("[billing] check threw:", error);
      return redirect("/app/billing");
    }
  } else {
    console.log("[billing] skipped (billing page)");
  }

  console.log("[app.tsx] returning apiKey");
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
