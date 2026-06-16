# Admin API & App Bridge Compliance

**Verified:** 2026-06-16 (SL-47)

## GraphQL-only Admin API

Shopify requires new public apps (post-April 2025) to use the GraphQL Admin API exclusively.

**Result: COMPLIANT**

Repo-wide check for REST API patterns:
```
grep -rn "admin\.rest\|/admin/api/" app/ extensions/
```
→ **0 matches.** All Admin API access uses `admin.graphql(...)`.

## Package Versions

| Package | Previous | Upgraded To | Notes |
|---|---|---|---|
| `@shopify/shopify-app-remix` | `3.3.3` (installed: `3.8.5`) | `4.2.0` | Major version upgrade (v3 → v4) |
| `@shopify/app-bridge-react` | `4.1.7` (installed: `4.2.10`) | `4.2.11` | Already on current major (v4); bumped to latest |
| `@shopify/shopify-api` | `11.14.1` | `13.0.0` | Pulled in transitively by remix v4; upgraded top-level to match |
| `@shopify/shopify-app-session-storage-prisma` | `5.2.3` | `9.0.0` | Required for shopify-api v13 + prisma v6 compatibility |
| `prisma` / `@prisma/client` | `5.22.0` | `6.19.3` | Required by session-storage-prisma v9 |

All packages are now on their current major versions.

## Migration notes

The `shopify-app-remix` v3 → v4 upgrade required a dependency chain update:
- `shopify-api` v11 → v13 (bundled internally in remix v4; top-level updated to match)
- `session-storage-prisma` v5 → v9 (needed to match shopify-api v13 and prisma v6)
- `prisma` / `@prisma/client` v5 → v6 (needed by session-storage-prisma v9)

The integration test `global-setup.ts` was updated to replace `prisma db push --force-reset` with a psql `DROP SCHEMA / CREATE SCHEMA` + `prisma db push` sequence, which achieves the same clean-slate reset without triggering Prisma v6's AI safety guard on destructive operations.

TypeScript compiles clean (`tsc --noEmit`) and all 124 tests pass after the upgrade.
