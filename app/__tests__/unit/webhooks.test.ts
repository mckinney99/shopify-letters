import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("~/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(),
  },
}));

vi.mock("~/db.server", () => ({
  default: {
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    productConfig: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    customizationField: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    pricingRule: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}));

import { authenticate } from "~/shopify.server";
import db from "~/db.server";
import { action } from "~/routes/webhooks";

const SHOP = "gdpr-test.myshopify.com";

function makeRequest(): Request {
  return new Request("http://localhost/webhooks", { method: "POST" });
}

async function callAction(): Promise<Response> {
  return action({ request: makeRequest(), params: {}, context: {} }).catch(
    (v) => {
      if (v instanceof Response) return v;
      throw v;
    }
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CUSTOMERS_DATA_REQUEST webhook", () => {
  beforeEach(() => {
    vi.mocked(authenticate.webhook).mockResolvedValue({
      topic: "CUSTOMERS_DATA_REQUEST",
      shop: SHOP,
      session: {} as any,
      admin: {} as any,
      payload: {},
    } as any);
  });

  it("returns 200", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await callAction();
    expect(response.status).toBe(200);
  });

  it("logs gdpr_customers_data_request with shop and no_customer_pii_stored note", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await callAction();
    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.event).toBe("gdpr_customers_data_request");
    expect(logged.shop).toBe(SHOP);
    expect(logged.note).toBe("no_customer_pii_stored");
  });
});

describe("CUSTOMERS_REDACT webhook", () => {
  beforeEach(() => {
    vi.mocked(authenticate.webhook).mockResolvedValue({
      topic: "CUSTOMERS_REDACT",
      shop: SHOP,
      session: {} as any,
      admin: {} as any,
      payload: {},
    } as any);
  });

  it("returns 200", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await callAction();
    expect(response.status).toBe(200);
  });

  it("logs gdpr_customers_redact with shop and no_customer_pii_stored note", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await callAction();
    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.event).toBe("gdpr_customers_redact");
    expect(logged.shop).toBe(SHOP);
    expect(logged.note).toBe("no_customer_pii_stored");
  });
});

describe("SHOP_REDACT webhook", () => {
  beforeEach(() => {
    vi.mocked(authenticate.webhook).mockResolvedValue({
      topic: "SHOP_REDACT",
      shop: SHOP,
      session: null,
      admin: null,
      payload: {},
    } as any);
    vi.mocked(db.pricingRule.deleteMany).mockResolvedValue({ count: 0 });
    vi.mocked(db.customizationField.deleteMany).mockResolvedValue({ count: 0 });
    vi.mocked(db.productConfig.deleteMany).mockResolvedValue({ count: 0 });
    vi.mocked(db.session.deleteMany).mockResolvedValue({ count: 0 });
  });

  it("returns 200", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await callAction();
    expect(response.status).toBe(200);
  });

  it("deletes pricingRule, customizationField, productConfig, and session rows for the shop", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await callAction();
    expect(db.pricingRule.deleteMany).toHaveBeenCalledWith({ where: { shop: SHOP } });
    expect(db.customizationField.deleteMany).toHaveBeenCalledWith({ where: { shop: SHOP } });
    expect(db.productConfig.deleteMany).toHaveBeenCalledWith({ where: { shop: SHOP } });
    expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { shop: SHOP } });
  });

  it("logs gdpr_shop_redact with shop", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await callAction();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.event).toBe("gdpr_shop_redact");
    expect(logged.shop).toBe(SHOP);
  });
});
