# Shopify App Store Listing Copy

**App:** Etch  
**Prepared:** 2026-06-17 (SL-51)  
**Listing editor:** https://apps.shopify.com/services/partner-app-submissions/5904cf9b73a4faab36946d484c5b5feb/en

---

## App Introduction (≤100 chars)

```
Charge shoppers for custom text — by character, word, or flat fee. No code needed.
```
*(82 chars)*

---

## App Details (≤500 chars)

```
Etch adds a "Personalize your item" form to your product pages so shoppers can enter custom text — engravings, monograms, gift messages, initials — and your price updates automatically based on what they type.

Set pricing rules per product: charge by character count, word count, or a flat fee per field. Etch installs as a native app block in the Theme Editor — no code changes required. Customization details appear directly on order line items so your team knows exactly what to make.
```
*(488 chars)*

---

## Features (≤80 chars each)

1. `Flexible pricing: charge by character, word count, or a flat fee per field`  *(75 chars)*
2. `Native Theme Editor app block — installs without touching your theme code`  *(73 chars)*
3. `Customization text printed on order line items for easy fulfillment`  *(67 chars)*
4. `Per-product rules: configure each product's fields independently`  *(63 chars)*
5. `Works with all modern Shopify themes and the native checkout`  *(59 chars)*

---

## Pricing (must appear in text, not embedded in images)

- **Plan:** Monthly subscription
- **Price:** $9.99/month
- **Free trial:** 14 days, no credit card required
- **Cancel:** Any time from your Shopify admin

---

## Categories

- **Primary:** Selling products
- **Secondary:** Store design

---

## Tags / Search Terms (up to 5)

1. engraving
2. personalization
3. custom text
4. product customization
5. monogram

---

## Support & Legal

- **Support email:** support@etch.direct
- **Privacy policy URL:** https://etch.direct/privacy

---

## Screenshots

Captured at 1600×900. Stored in `assets/screenshots/`.

| File | Alt text | Status |
|---|---|---|
| `01-product-page.png` | Etch customization form on a Sterling Silver Name Necklace product page showing the "Personalize your item" section with Custom Message field and character counter | ✅ Captured |
| `02-product-page-filled.png` | Sterling Silver Name Necklace product page with "Emma" entered in the Custom Message field — price updates automatically based on character count | ✅ Captured |
| `03-cart.png` | Luminary Fine Jewelry cart showing a Sterling Silver Name Necklace with "Custom Message: Emma" on the line item | ✅ Captured |
| `04-admin-products.png` | Etch admin showing the product list with configured customization fields | ⚠️ Manual step — capture with `npm run dev` running, then visit `/app/products` |
| `05-admin-product-config.png` | Etch admin product configuration screen showing pricing rules setup | ⚠️ Manual step — capture with `npm run dev` running, then visit `/app/products/{id}` |

**To capture the admin screenshots (04 + 05):**
1. Run `npm run dev` in the shopify-letters repo
2. Open `https://admin.shopify.com/store/its-peanut-butter-jelly-time/apps/etch-4` in a 1600×900 browser window
3. Screenshot the products list page and one product config page
4. Save as `assets/screenshots/04-admin-products.png` and `05-admin-product-config.png`

---

## Feature Media

**Recommended:** 1600×900 static image showing the admin config panel on the left and the live storefront customization form on the right — a split-screen "set it up / see it work" visual.

**Alternative:** 2–3 minute demo video covering:
1. Opening Etch in the Shopify admin
2. Configuring a product with a Custom Message field at $2/character
3. Visiting the storefront, typing a message, watching the price update
4. Completing checkout and seeing the customization on the order

*Feature media must be produced manually. A static composite image can be made by combining `02-product-page-filled.png` and an admin screenshot side-by-side in any image editor.*

---

## App Icon

- **File:** `assets/icon.png`
- **Dimensions:** 1200×1200 PNG
- **Source:** Uploaded by merchant (replaces generated draft)

---

## Listing Submission Checklist

- [ ] Icon uploaded (`assets/icon.png`, 1200×1200)
- [ ] Screenshots 01–03 uploaded (captured in this story)
- [ ] Screenshots 04–05 captured manually and uploaded (requires dev server)
- [ ] Feature media produced and uploaded
- [ ] App Introduction filled in (83 chars)
- [ ] App Details filled in (478 chars)
- [ ] 5 Feature entries entered (all ≤80 chars)
- [ ] Categories set (Selling products / Store design)
- [ ] 5 search terms entered
- [ ] Support email set: `support@etch.direct` (see SL-55 to activate send-as)
- [ ] Privacy policy URL set: `https://etch.direct/privacy`
- [ ] Pricing plan described in text copy (not embedded in images): $9.99/month, 14-day free trial
