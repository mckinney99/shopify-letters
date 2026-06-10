// In-memory sliding-window rate limiter factory. Per-process only —
// sufficient for abuse prevention at this scale (see SL-25 spike doc).
export function makeRateLimiter(max: number, windowMs: number) {
  const windows = new Map<string, number[]>();

  return function checkRateLimit(key: string): boolean {
    const now = Date.now();
    const timestamps = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
    if (timestamps.length >= max) return false;
    timestamps.push(now);
    windows.set(key, timestamps);
    return true;
  };
}
