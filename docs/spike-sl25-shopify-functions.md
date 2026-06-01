# SL-25 Spike: Shopify Functions for Checkout Price Enforcement

**Date:** 2026-06-01
**Author:** Eric McKinney
**Status:** Decision made — unblocks SL-27

---

## Problem

The storefront extension previews a customization price, but nothing enforces that price at checkout. A shopper could bypass the extension and add the product to cart directly (via URL or API), paying the base variant price only. We need a mechanism that runs at checkout and enforces the correct per-character price regardless of how the item was added.

---

## Constraints Discovered

### Shopify Functions cannot make network calls
This is the most important constraint. Functions are pure WebAssembly modules executed synchronously inside Shopify's infrastructure — they have no HTTP access. **Remote validation (calling our preview API at checkout) is not possible.** All pricing logic must be embedded in the WASM bundle itself.

### Pricing rules must travel with the cart
Because Functions can't reach our database, the pricing rules (base price, per-char price, char groups) must be available from within the Function's input. Shopify provides two mechanisms:
1. **Product metafields** — merchant-defined data attached to the product, readable by Functions via metafield queries declared in the function's `input_query`.
2. **Cart line properties** — arbitrary key-value pairs set by the storefront when the shopper adds to cart.

We need both: line properties carry the shopper's text inputs; metafields carry the merchant's pricing rules.

### WASM bundle size limit: ~256 KB
The compiled WASM artifact must stay under ~256 KB. Our pricing engine (per-character math, group lookup, rounding) is trivial — well under any size constraint.

---

## Eligible Function Types

| Type | Can modify line price | Can read line properties | Can read metafields | Notes |
|---|---|---|---|---|
| **Cart Transform** | ✅ via expand/merge | ✅ | ✅ | Best fit — designed to reshape cart lines |
| Product Discount | Discount only (%) | ✅ | ✅ | Can't set an absolute price; requires knowing base |
| Order Discount | Discount only (%) | ✅ | ✅ | Too coarse — whole-order level |
| Delivery Customization | ✗ | ✗ | ✅ | Not relevant |

**Cart Transform is the correct type.** It is specifically designed to take a line item and expand it into one or more repriced lines, which is exactly what we need: split the customized product into a base line + a per-character-cost line, or simply set the enforced price on the expanded line.

---

## Language Options

Shopify Functions support four authoring targets:

| Language | WASM output | Code sharing with app | Complexity |
|---|---|---|---|
| **JavaScript / TypeScript** | Via Shopify's QuickJS runtime | ✅ High — same language as app | Low |
| AssemblyScript | Native WASM | Partial — TS-like syntax | Medium |
| Rust | Native WASM | ✗ — different language | High |
| Go | Native WASM | ✗ | High |

**JavaScript/TypeScript Functions** are available for Cart Transform. This means we can port (or directly inline) the TypeScript pricing engine into the Function with minimal rewrite. Performance is slower than native WASM but the pricing calculation is O(n) over characters — fast enough that the QuickJS overhead doesn't matter.

---

## Recommended Approach

### Function type: Cart Transform (JavaScript/TypeScript)

### Data flow at checkout

```
Shopper adds to cart
  → line properties: { fieldId: value, ... } set by extension JS
  → variant price: base variant price (set in Shopify admin)

Checkout begins
  → Cart Transform Function runs
  → Input: cart lines + product metafields (pricing rules)
  → Function normalizes each field value (same trim/whitespace logic as normalize.ts)
  → Function runs pricing engine (same math as pricing.ts)
  → Function expands line into: base-price line + per-char-cost line (or sets a single expanded line at enforced price)
  → Checkout total reflects enforced price
```

### Metafield sync requirement (new work in SL-27)
When a merchant saves pricing rules in the admin, we must write a `product.metafields` entry containing the serialized pricing rules. The Cart Transform Function declares this metafield in its `input_query` so Shopify injects it at execution time.

This adds a step to the admin save flow (admin → Shopify GraphQL `metafieldsSet` mutation).

### Pricing engine portability
`app/utils/pricing.ts` and `app/utils/normalize.ts` are pure functions with no imports outside standard JS. They can be copy-pasted verbatim into the Function's TypeScript source. This avoids any divergence risk.

---

## Tradeoffs

| | JS/TS Function (recommended) | Rust/WASM |
|---|---|---|
| Code sharing | Direct port of existing TS | Full rewrite |
| WASM execution speed | ~5–10× slower (QuickJS) | Native speed |
| Bundle size | Larger (QuickJS runtime included) | Smaller |
| Maintenance | One language for app + function | Two languages |
| Risk | Lower | Higher (rewrite bugs) |

At the scale of this pricing engine (simple arithmetic over ~100 chars), the QuickJS performance overhead is immeasurable in practice. The maintenance benefit of staying in TypeScript is significant.

---

## Decision

**Implement SL-27 as a Cart Transform Function in TypeScript**, reading pricing rules from product metafields and shopper inputs from line properties. Port `pricing.ts` and `normalize.ts` verbatim into the function source. Add a metafield sync step to the admin save flow.

**This decision unblocks SL-27.**
