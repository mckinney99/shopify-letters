import { logEvent, logAlert } from "./log";

// In-memory rolling metrics — see SL-32. Each Node process accumulates its
// own per-shop windows; the emitted metric_* events are the queryable
// destination (AC5) for whatever log aggregation the host provides.

// ── AC1: preview API p50/p95 latency per shop ────────────────────────────────

const LATENCY_WINDOW_SIZE = 100;
const LATENCY_REPORT_EVERY = 20;

const latencyWindows = new Map<string, number[]>();
const previewCounts = new Map<string, number>();

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function recordPreviewLatency(shop: string, latencyMs: number): void {
  let window = latencyWindows.get(shop);
  if (!window) {
    window = [];
    latencyWindows.set(shop, window);
  }
  window.push(latencyMs);
  if (window.length > LATENCY_WINDOW_SIZE) window.shift();

  const count = (previewCounts.get(shop) ?? 0) + 1;
  previewCounts.set(shop, count);

  if (count % LATENCY_REPORT_EVERY === 0) {
    const sorted = [...window].sort((a, b) => a - b);
    logEvent("metric_preview_latency", {
      shop,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      sampleSize: sorted.length,
    });
  }
}

// ── AC4 + AC6: preview/charged price mismatch rate per shop, with alerting ───

const MISMATCH_WINDOW_SIZE = 50;
const MISMATCH_MIN_SAMPLE = 10;
const MISMATCH_THRESHOLD = 0.05; // 5%

const mismatchWindows = new Map<string, boolean[]>();
const mismatchAlerting = new Map<string, boolean>();

export function recordPriceMismatch(
  shop: string,
  fields: {
    productId: string | null;
    correlationId: string | null;
    previewPriceMinor: number;
    chargedPriceMinor: number;
  }
): void {
  const mismatch = fields.previewPriceMinor !== fields.chargedPriceMinor;

  logEvent("metric_price_mismatch", { shop, ...fields, mismatch });

  let window = mismatchWindows.get(shop);
  if (!window) {
    window = [];
    mismatchWindows.set(shop, window);
  }
  window.push(mismatch);
  if (window.length > MISMATCH_WINDOW_SIZE) window.shift();

  const sampleSize = window.length;
  const rate = window.filter(Boolean).length / sampleSize;
  const exceeded = sampleSize >= MISMATCH_MIN_SAMPLE && rate > MISMATCH_THRESHOLD;

  // Edge-triggered: only alert on the transition into "exceeded", so a
  // sustained high rate (e.g. across repeated admin page loads) pages once
  // per incident rather than once per sample.
  if (exceeded && !mismatchAlerting.get(shop)) {
    logAlert("price_mismatch_rate_exceeded", { shop, rate, sampleSize, threshold: MISMATCH_THRESHOLD });
  }
  mismatchAlerting.set(shop, exceeded);
}
