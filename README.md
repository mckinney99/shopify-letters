# shopify-letters

A Shopify app for merchants selling customizable products with input-based pricing (e.g. engraved text length). Merchants configure fields and pricing rules once; shoppers see the correct price before purchase.

Built with [Remix](https://remix.run) + Node.js on the [Shopify App framework](https://shopify.dev/docs/apps/getting-started).

---

## Prerequisites

- **Node.js** >= 18.20.0 (`node --version`)
- **npm** >= 10 (`npm --version`)
- **Docker** — for running Postgres locally (`docker --version`)
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
| `DATABASE_URL` | Leave as the default — points at the local Postgres container started via `docker compose up -d` |

> `SHOPIFY_APP_URL` is set automatically by `shopify app dev` — leave it blank.

### 3. Register your app in Shopify Partners

> **One-time setup — requires a browser.**

1. Go to [partners.shopify.com](https://partners.shopify.com) and sign in (free account)
2. In the sidebar: **Apps** → **Create app** → **Create app manually**
3. Give it a name (e.g. "shopify-letters dev")
4. Copy the **API key** → paste into `SHOPIFY_API_KEY` in `.env`
5. Copy the **API secret key** → paste into `SHOPIFY_API_SECRET` in `.env`
6. Back in the terminal, run: `shopify app config link`
   - This links `shopify.app.toml` to your Partners app and fills in `client_id`
   - You'll be prompted to log in with Shopify CLI the first time

### 3a. Create a development store

> **One-time setup — requires Partners dashboard.**

1. In Partners: **Stores** → **Add store** → **Create development store**
2. Choose **Start with test data** for a pre-populated catalog
3. Give it a name (e.g. "shopify-letters-dev")
4. Click **Create development store**

You'll select this store when `shopify app dev` asks which store to use.

### 4. Set up the database

Start a local Postgres database with Docker Compose:

```bash
docker compose up -d
```

This runs Postgres on `localhost:5433` with a persistent volume (database `shopify_letters`, user/password `postgres`/`postgres` — matches the default `DATABASE_URL` in `.env.example`).

Then apply the schema:

```bash
npm run setup
# runs: prisma generate && prisma migrate dev
```

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

Integration tests require the local Postgres container to be running (`docker compose up -d`). They use a separate `test` schema in the same `shopify_letters` database, which is reset automatically before each run.

```bash
# All tests
npm test

# Unit only (no Shopify/DB required)
npm run test:unit

# Integration (requires local Postgres - see above)
npm run test:integration
```

---

## Deployment

```bash
# Deploy app and extensions to Shopify
shopify app deploy
```

The production AWS infrastructure (RDS, ECR, ECS Fargate, ALB) is defined as Terraform in [`terraform/`](./terraform/README.md). For the broader hosting architecture, see `docs/architecture-outline.md`.

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
│   ├── schema.prisma            # DB schema (Session + app models)
│   └── migrations/               # Postgres migration history
├── public/                      # Static assets
├── docs/                        # Architecture and planning docs
├── .env.example                 # Environment variable template
├── docker-compose.yml           # Local Postgres for development
├── terraform/                    # Production AWS infrastructure (RDS, ECR, ECS, ALB)
├── shopify.app.toml             # Shopify CLI app configuration
└── vite.config.ts               # Vite/Remix build config
```

---

## Related docs

- [PRD](./_bmad-output/planning-artifacts/prd.md)
- [Architecture outline](./docs/architecture-outline.md)
- [Jira board](https://beetect.atlassian.net/jira/software/projects/SL/boards/34)
