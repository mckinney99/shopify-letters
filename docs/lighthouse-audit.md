# Lighthouse Performance Audit

**Audited:** 2026-06-16 (SL-49)
**Store:** its-peanut-butter-jelly-time.myshopify.com
**Extension version tested:** etch-8 (active app block on product pages)
**Tool:** Lighthouse 12.8.2, headless Chrome, `--only-categories=performance`

## Results

### Home page (`/`)
Etch extension is not loaded on the home page — no comparison needed.

| Metric | Score |
|---|---|
| Performance score | 83 |
| LCP | 3.7 s |
| CLS | 0 |
| FCP | 2.4 s |

### Product page (`/products/bread`) — key comparison

| Metric | With etch | Without etch | Delta |
|---|---|---|---|
| Performance score | 75 | 77 | **−2 pts** |
| LCP | 4.6 s | 4.4 s | +0.2 s |
| CLS | 0.012 | 0 | +0.012 |
| TBT | 0 ms | 10 ms | −10 ms |
| FCP | 3.1 s | 3.0 s | +0.1 s |

"Without etch" was measured by blocking `*/etch-customization.js` via `--blocked-url-patterns`, simulating the extension being disabled.

### Collection page (`/collections/all`)
Etch extension is not loaded on collection pages — no comparison needed.

| Metric | Score |
|---|---|
| Performance score | 89 |
| LCP | 3.2 s |
| CLS | 0 |
| FCP | 2.2 s |

## Pass/Fail verdict

**PASS.** Shopify requires that a theme app extension not drop any page's score by more than 10 points. The measured impact is **−2 points** on the product page, well within the limit.

| Page | Delta | Limit | Result |
|---|---|---|---|
| Home | 0 (not loaded) | −10 | ✓ Pass |
| Product | −2 pts | −10 | ✓ Pass |
| Collection | 0 (not loaded) | −10 | ✓ Pass |

## Notes

- The CLS of 0.012 with etch enabled (vs 0 without) is caused by the customization form rendering after initial paint. This is still rated **Good** by Core Web Vitals (threshold is < 0.1) and is not a concern.
- Absolute LCP on the product page (4.6 s) is above the "Good" threshold of 2.5 s regardless of whether etch is enabled. This is a characteristic of the test store's default theme and product images, not of the etch extension itself.
- These results should be included in the App Store submission Q&A when asked about Lighthouse impact.

## For App Store Q&A

> **Does your theme app extension impact storefront performance?**
>
> Yes. The `etch-customization` app block is placed on product pages and loads a single JavaScript file (`etch-customization.js`) from the Shopify CDN. Lighthouse testing against our test store shows a performance score delta of −2 points on the product page (score 75 with extension vs 77 without). This is within Shopify's required −10 point limit. CLS remains in the "Good" range (0.012). Home and collection pages are unaffected as the extension is not loaded on those page types.
