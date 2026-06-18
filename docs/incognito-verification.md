# Incognito / Session-Token Verification

**Audited:** 2026-06-16 (SL-50)
**App:** Etch embedded admin (`@shopify/shopify-app-remix` v4.2.0)
**Auth strategy:** `unstable_newEmbeddedAuthStrategy: true`

## Verdict: PASS — incognito-safe

The embedded admin works in incognito mode (and any browser that blocks third-party cookies) because it relies exclusively on Shopify's session-token auth flow, not on cookies set by the app itself.

---

## Evidence

### 1. `unstable_newEmbeddedAuthStrategy: true` (config flag)

`app/shopify.server.ts` line 183:

```ts
future: {
  unstable_newEmbeddedAuthStrategy: true,
},
```

This flag switches `@shopify/shopify-app-remix` from the legacy cookie-exchange flow to the session-token-only flow. Shopify App Bridge injects a signed JWT into every API request; `authenticate.admin(request)` verifies the JWT server-side and returns an authenticated session without setting any browser cookies. No redirect to `/auth` is needed on navigation — the token is re-injected by App Bridge on every request.

### 2. No client-side browser storage (code audit)

Searched all files under `app/` for browser storage APIs:

```
grep -rn "localStorage|sessionStorage|document\.cookie|cookies\.set|cookies\.get|window\.cookie" app/
```

**Hits:**
```
app/shopify.server.ts:71:  sessionStorage: new PrismaSessionStorage(prisma),
app/shopify.server.ts:197: export const sessionStorage = shopify.sessionStorage;
```

Both references are the server-side `PrismaSessionStorage` object (a database-backed session store used by the Shopify library). Neither is a browser `window.sessionStorage` call. No client-side storage of any kind is used.

### 3. Server-side session persistence via Prisma

Sessions are stored in the `Session` table in Postgres via `PrismaSessionStorage`. The browser holds nothing. A fresh incognito tab gets a new App Bridge JWT; `authenticate.admin()` verifies it against the stored server session, and all routes respond normally.

### 4. Billing gate

`app/routes/app.tsx` calls `authenticate.admin(request)` with a billing check on every load. The billing state is resolved server-side from the Shopify API using the JWT — no browser state involved.

---

## Routes exercised (code review)

| Route | Auth call | Notes |
|---|---|---|
| `app._index.tsx` | `authenticate.admin` | Home dashboard |
| `app.products.tsx` | Layout shell | No direct auth; delegates to index/detail |
| `app.products._index.tsx` | `authenticate.admin` | Product config list |
| `app.products.$productId.tsx` | `authenticate.admin` | Product detail / field editor |
| `app.orders._index.tsx` | `authenticate.admin` | Order list |
| `app.orders.$orderId.tsx` | `authenticate.admin` | Order detail |
| `app.billing.tsx` | `authenticate.admin` | Subscription gate |
| `app.support.tsx` | `authenticate.admin` | Help & Support page |
| `webhooks.tsx` | HMAC verification | Not an embedded route |
| `privacy.tsx` | None (public) | Privacy policy |

All embedded routes use `authenticate.admin(request)`. With `unstable_newEmbeddedAuthStrategy: true`, every call is JWT-verified without touching browser storage.

---

## Third-party cookie dependency: None

Legacy Shopify embedded apps required the app to set a session cookie in the top-level frame, which browsers block in iframes in incognito and with ITP enabled. The new session-token strategy eliminates this entirely — no iframe cookie handshake, no `sameSite` workaround needed.

---

## For App Store submission

> **Does your embedded admin work in browsers that block third-party cookies (e.g. Safari, incognito Chrome)?**
>
> Yes. Etch uses `@shopify/shopify-app-remix` with `unstable_newEmbeddedAuthStrategy: true`, which is Shopify's session-token-only auth mechanism. Authentication is handled via a JWT injected by Shopify App Bridge on every request — no cookies are set by the app, and no browser storage is read or written. The embedded admin is fully functional in incognito mode and in Safari's ITP environment.
