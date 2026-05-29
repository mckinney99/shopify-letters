import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate, login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.pathname === "/auth/login") {
    const shop = url.searchParams.get("shop");
    // When shop is already known, skip the login form and go directly to OAuth
    if (shop) throw redirect(`/auth?shop=${shop}`);
    return login(request);
  }
  await authenticate.admin(request);
  return null;
};
