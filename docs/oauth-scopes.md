# OAuth Access Scopes

**Audited:** 2026-06-16 (SL-46)

The following scopes are declared in `shopify.app.etch.toml`. Each is mapped to the code that requires it.

| Scope | Justification | Location |
|---|---|---|
| `read_orders` | Merchants view order history and per-order engraving details in the embedded admin | `app/routes/app.orders._index.tsx` (`GetOrders` query), `app/routes/app.orders.$orderId.tsx` (`GetOrder` query) |
| `read_products` | Merchant product list and detail views; product title displayed in configuration UI | `app/routes/app.products._index.tsx` (`GetProducts` query), `app/routes/app.products.$productId.tsx` (`GetProduct` query) |
| `write_products` | Pricing config is serialized to a product metafield (`etch/pricing_rules`) so Cart Transform functions can read it at checkout without network calls | `app/routes/app.products.$productId.tsx` (`MetafieldsSet` mutation, `ownerId: productGid`) |
| `write_cart_transforms` | `cartTransformCreate` is called once per shop on install to register the Cart Transform function with checkout | `app/shopify.server.ts` (`afterAuth` hook) |
| `write_validations` | `validationCreate` is called once per shop on install to enable the cart validation function at checkout | `app/shopify.server.ts` (`afterAuth` hook) |

## Removed scopes

| Scope | Reason for removal |
|---|---|
| `write_orders` | No order-write mutations (`orderEditBegin`, `orderEditAddCustomItem`, `draftOrderCreate`, etc.) exist anywhere in `app/` or `extensions/`. Removed in SL-46. |

## REST API usage

None. All Admin API calls use GraphQL (`admin.graphql(...)`). No `admin.rest` or `/admin/api/` REST calls exist in `app/` or `extensions/`.
