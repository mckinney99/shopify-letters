import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logEvent } from "../utils/log";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } =
    await authenticate.webhook(request);

  if (!admin && topic !== "SHOP_REDACT") {
    throw new Response();
  }

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) {
        await db.session.deleteMany({ where: { shop } });
      }
      break;
    case "CUSTOMERS_DATA_REQUEST":
      logEvent("gdpr_customers_data_request", { shop, note: "no_customer_pii_stored" });
      break;
    case "CUSTOMERS_REDACT":
      logEvent("gdpr_customers_redact", { shop, note: "no_customer_pii_stored" });
      break;
    case "SHOP_REDACT":
      // PricingRule → CharPriceGroup cascade handles char groups automatically
      await db.pricingRule.deleteMany({ where: { shop } });
      await db.customizationField.deleteMany({ where: { shop } });
      await db.productConfig.deleteMany({ where: { shop } });
      await db.session.deleteMany({ where: { shop } });
      logEvent("gdpr_shop_redact", { shop });
      break;
    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  throw new Response();
};
