import { describe, it, expect, vi, afterEach } from "vitest";
import { logEvent, logAlert, shortHash } from "~/utils/log";

describe("shortHash", () => {
  it("is deterministic for the same input", () => {
    expect(shortHash("hello")).toBe(shortHash("hello"));
  });

  it("returns a short hex string", () => {
    expect(shortHash("hello")).toMatch(/^[0-9a-f]{12}$/);
  });

  it("changes when the input changes", () => {
    expect(shortHash("hello")).not.toBe(shortHash("world"));
  });
});

describe("logEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a single JSON line containing the event name and fields", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent("preview_request", { shop: "test.myshopify.com", priceMinor: 750 });

    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.event).toBe("preview_request");
    expect(logged.shop).toBe("test.myshopify.com");
    expect(logged.priceMinor).toBe(750);
    expect(typeof logged.ts).toBe("string");
  });
});

describe("logAlert", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a JSON line on stderr with severity: alert", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logAlert("price_mismatch_rate_exceeded", { shop: "test.myshopify.com", rate: 0.2 });

    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.event).toBe("price_mismatch_rate_exceeded");
    expect(logged.severity).toBe("alert");
    expect(logged.shop).toBe("test.myshopify.com");
    expect(logged.rate).toBe(0.2);
    expect(typeof logged.ts).toBe("string");
  });
});
