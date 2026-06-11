import { createHash } from "crypto";

// Structured logging helpers — see SL-31. Every event is a single JSON line
// on stdout so it can be queried/filtered by `event`, `correlationId`, etc.
// in whatever log aggregation the merchant's hosting provider offers.

export function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

export function logEvent(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));
}
