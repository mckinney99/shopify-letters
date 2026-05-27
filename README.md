# shopify-letters

A Shopify app for merchants selling customizable products with input-based pricing (e.g. engraved text length). Merchants configure fields and pricing rules once; shoppers see the correct price before purchase.

Built with [Remix](https://remix.run) + Node.js on the [Shopify App framework](https://shopify.dev/docs/apps/getting-started).

---

## Prerequisites

- **Node.js** >= 18.20.0 (`node --version`)
- **npm** >= 10 (`npm --version`)
- **Shopify Partners account** — [partners.shopify.com](https://partners.shopify.com) (free)
- **Development store** — created from Partners dashboard (free, unlimited orders)
- **GitHub CLI** — `gh auth login` (for PR workflow)

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/mckinney99/shopify-letters.git
cd shopify-letters
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to find it |
|---|---|
| `SHOPIFY_API_KEY` | Partners dashboard → Apps → your app → API credentials |
| `SHOPIFY_API_SECRET` | Same location |
| `SCOPES` | Leave as default or adjust |
| `DATABASE_URL` | Leave as `file:./dev.db` for local SQLite |

> `SHOPIFY_APP_URL` is set automatically by `shopify app dev` — leave it blank.

### 3. Register your app in Partners

If you haven't already:

1. Go to [partners.shopify.com](https://partners.shopify.com) → **Apps** → **Create app**
2. Choose **Create app manually**
3. Copy the **API key** and **API secret** into your `.env`
4. Run `shopify app config link` to sync `shopify.app.toml` with your registered app

### 4. Set up the database

```bash
npm run setup
# runs: prisma generate && prisma migrate dev
```

This creates a local SQLite database at `prisma/dev.db`.

### 5. Start the dev server

```bash
npm run dev
# runs: shopify app dev
```

The Shopify CLI will:
- Start the Remix app on a local port
- Open a **Cloudflare tunnel** automatically (no ngrok needed)
- Prompt you to select your development store on first run
- Install the app on your dev store

The embedded admin app will be available inside your dev store's Shopify Admin.

---

## Testing

```bash
# All tests
npm test

# Unit only (no Shopify/DB required)
npm run test:unit

# Integration (requires test DB)
npm run test:integration
```

---

## Deployment

```bash
# Deploy app and extensions to Shopify
shopify app deploy
```

For hosting the backend, see the architecture outline in `docs/architecture-outline.md`.

---

## Project structure

```
/
├── app/
│   ├── routes/
│   │   ├── app.tsx              # Authenticated admin layout (App Bridge)
│   │   ├── app._index.tsx       # Dashboard home
│   │   ├── auth.$.tsx           # OAuth callback handler
│   │   └── webhooks.tsx         # Shopify webhook handler
│   ├── shopify.server.ts        # Shopify auth + session config
│   ├── db.server.ts             # Prisma client singleton
│   ├── root.tsx                 # HTML root
│   ├── entry.server.tsx         # SSR entry
│   └── entry.client.tsx         # Client hydration entry
├── extensions/                  # Shopify extensions (theme app, functions)
├── prisma/
│   └── schema.prisma            # DB schema (Session + app models)
├── public/                      # Static assets
├── docs/                        # Architecture and planning docs
├── .env.example                 # Environment variable template
├── shopify.app.toml             # Shopify CLI app configuration
└── vite.config.ts               # Vite/Remix build config
```

---

## Related docs

- [PRD](./_bmad-output/planning-artifacts/prd.md)
- [Architecture outline](./docs/architecture-outline.md)
- [Jira board](https://beetect.atlassian.net/jira/software/projects/SL/boards/34)
