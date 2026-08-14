# OAuth Access Scopes

**Audited:** 2026-06-16 (SL-46). **Updated:** 2026-08-12 (SL-125) to add scopes introduced since the last audit; see below.

The following scopes are declared in `shopify.app.etch.toml`. Each is mapped to the code that requires it.

| Scope | Justification | Location |
|---|---|---|
| `read_orders` | Merchants view order history and per-order engraving details in the embedded admin | `app/routes/app.orders._index.tsx` (`GetOrders` query), `app/routes/app.orders.$orderId.tsx` (`GetOrder` query) |
| `read_products` | Merchant product list and detail views; product title displayed in configuration UI | `app/routes/app.products._index.tsx` (`GetProducts` query), `app/routes/app.products.$productId.tsx` (`GetProduct` query) |
| `write_products` | Pricing config is serialized to a product metafield (`etch/pricing_rules`) so Cart Transform functions can read it at checkout without network calls | `app/routes/app.products.$productId.tsx` (`MetafieldsSet` mutation, `ownerId: productGid`) |
| `write_cart_transforms` | `cartTransformCreate` is called once per shop on install to register the Cart Transform function with checkout | `app/shopify.server.ts` (`afterAuth` hook) |
| `write_validations` | `validationCreate` is called once per shop on install to enable the cart validation function at checkout | `app/shopify.server.ts` (`afterAuth` hook) |
| `read_files` | Reading back uploaded font/image files from the Files API after upload (Assets library, SL-120–122) | `app/routes/api.upload.ts` |
| `write_files` | Uploading merchant-provided fonts and images to Shopify's Files API for use in customization fields (Assets library, SL-120–122) | `app/routes/api.upload.ts` |
| `read_themes` | Detecting whether the Etch app embed is enabled on the merchant's published theme, to power the "Activate widget" setup step | `app/routes/app._index.tsx` (`checkWidgetActivated`, SL-140) |

**Not yet released to production.** `read_files`/`write_files`/`read_themes` exist on `feature/product-options` and staging but are not yet on `main` as of this audit. Existing merchants will see Shopify's scope-update consent prompt once the app version carrying these scopes is released to production (see `docs/release-runbook.md`).

## Removed scopes

| Scope | Reason for removal |
|---|---|
| `write_orders` | No order-write mutations (`orderEditBegin`, `orderEditAddCustomItem`, `draftOrderCreate`, etc.) exist anywhere in `app/` or `extensions/`. Removed in SL-46. |

## REST API usage

None. All Admin API calls use GraphQL (`admin.graphql(...)`). No `admin.rest` or `/admin/api/` REST calls exist in `app/` or `extensions/`.
