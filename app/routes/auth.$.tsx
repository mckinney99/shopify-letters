import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate, login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // authenticate.admin() throws when called from the login path — delegate to login() instead
  if (url.pathname === "/auth/login") {
    return login(request);
  }
  await authenticate.admin(request);
  return null;
};
