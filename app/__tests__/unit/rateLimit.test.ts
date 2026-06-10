import { describe, it, expect, vi, afterEach } from "vitest";
import { makeRateLimiter } from "~/utils/rateLimit";

describe("makeRateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to max requests per key within the window", () => {
    const checkRateLimit = makeRateLimiter(3, 60_000);

    expect(checkRateLimit("shop-a")).toBe(true);
    expect(checkRateLimit("shop-a")).toBe(true);
    expect(checkRateLimit("shop-a")).toBe(true);
    expect(checkRateLimit("shop-a")).toBe(false);
  });

  it("tracks separate windows per key", () => {
    const checkRateLimit = makeRateLimiter(1, 60_000);

    expect(checkRateLimit("shop-a")).toBe(true);
    expect(checkRateLimit("shop-b")).toBe(true);
    expect(checkRateLimit("shop-a")).toBe(false);
    expect(checkRateLimit("shop-b")).toBe(false);
  });

  it("allows requests again once the window has passed", () => {
    vi.useFakeTimers();
    const checkRateLimit = makeRateLimiter(1, 1_000);

    expect(checkRateLimit("shop-a")).toBe(true);
    expect(checkRateLimit("shop-a")).toBe(false);

    vi.advanceTimersByTime(1_001);

    expect(checkRateLimit("shop-a")).toBe(true);
  });
});
