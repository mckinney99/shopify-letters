import { describe, it, expect, vi, afterEach } from "vitest";
import { percentile, recordPreviewLatency, recordPriceMismatch } from "~/utils/metrics";

describe("percentile", () => {
  it("returns 0 for an empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("returns the single value for a one-element array", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });

  it("computes p50 and p95 for a sorted array", () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(sorted, 50)).toBe(50);
    expect(percentile(sorted, 95)).toBe(95);
  });
});

describe("recordPreviewLatency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a metric_preview_latency event every 20th call, with p50/p95", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const shop = "preview-latency-test.myshopify.com";

    for (let i = 1; i <= 20; i++) {
      recordPreviewLatency(shop, i * 10); // 10, 20, ..., 200
    }

    expect(spy).toHaveBeenCalledOnce();
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.event).toBe("metric_preview_latency");
    expect(logged.shop).toBe(shop);
    expect(logged.sampleSize).toBe(20);
    expect(logged.p50).toBe(100);
    expect(logged.p95).toBe(190);
  });

  it("does not log anything before the report interval is reached", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    for (let i = 0; i < 19; i++) {
      recordPreviewLatency("preview-latency-test-2.myshopify.com", 50);
    }

    expect(spy).not.toHaveBeenCalled();
  });

  it("tracks separate windows per shop", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    for (let i = 0; i < 20; i++) {
      recordPreviewLatency("preview-latency-shop-a.myshopify.com", 100);
    }
    expect(spy).toHaveBeenCalledOnce();

    spy.mockClear();
    for (let i = 0; i < 19; i++) {
      recordPreviewLatency("preview-latency-shop-b.myshopify.com", 100);
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("recordPriceMismatch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs metric_price_mismatch with mismatch: false when prices agree", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    recordPriceMismatch("mismatch-test-1.myshopify.com", {
      productId: "gid://shopify/Product/1",
      correlationId: "corr-1",
      previewPriceMinor: 1700,
      chargedPriceMinor: 1700,
    });

    expect(logSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.event).toBe("metric_price_mismatch");
    expect(logged.mismatch).toBe(false);
    expect(logged.previewPriceMinor).toBe(1700);
    expect(logged.chargedPriceMinor).toBe(1700);
    expect(logged.correlationId).toBe("corr-1");
  });

  it("logs mismatch: true when preview and charged prices differ", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    recordPriceMismatch("mismatch-test-2.myshopify.com", {
      productId: "gid://shopify/Product/1",
      correlationId: "corr-2",
      previewPriceMinor: 1700,
      chargedPriceMinor: 1500,
    });

    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.mismatch).toBe(true);
  });

  it("does not alert below the minimum sample size, even at a 100% mismatch rate", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const shop = "mismatch-test-low-sample.myshopify.com";

    for (let i = 0; i < 9; i++) {
      recordPriceMismatch(shop, {
        productId: "gid://shopify/Product/1",
        correlationId: `corr-${i}`,
        previewPriceMinor: 1700,
        chargedPriceMinor: 1500,
      });
    }

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("alerts via logAlert when the mismatch rate exceeds the threshold", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const shop = "mismatch-test-alert.myshopify.com";

    for (let i = 0; i < 10; i++) {
      recordPriceMismatch(shop, {
        productId: "gid://shopify/Product/1",
        correlationId: `corr-${i}`,
        previewPriceMinor: 1700,
        chargedPriceMinor: 1500,
      });
    }

    expect(errorSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.event).toBe("price_mismatch_rate_exceeded");
    expect(logged.severity).toBe("alert");
    expect(logged.shop).toBe(shop);
    expect(logged.sampleSize).toBe(10);
    expect(logged.rate).toBe(1);
  });

  it("does not alert when the mismatch rate stays under the threshold", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const shop = "mismatch-test-healthy.myshopify.com";

    for (let i = 0; i < 20; i++) {
      recordPriceMismatch(shop, {
        productId: "gid://shopify/Product/1",
        correlationId: `corr-${i}`,
        previewPriceMinor: 1700,
        chargedPriceMinor: 1700, // always matches
      });
    }

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
