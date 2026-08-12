# Release Runbook: `feature/product-options` → Production

**Status:** Not yet executed. This document describes the cutover procedure; it does not perform it. Merging to `main` and triggering the production deploy stays a deliberate, manual decision by whoever runs this runbook (SL-125 explicitly scopes this story to documentation only).

**Covers:** SL-113 → SL-144, currently living on `feature/product-options`, merging into the stale `main` (last updated 2026-07-07, commit `23104b7`).

---

## 1. Why this needs a runbook, not just a normal merge

- `main` is 127 commits and ~7,600 lines behind `feature/product-options`. This is not an incremental PR; it's a large batch cutover.
- Production deploys automatically on push to `main` (`.github/workflows/deploy.yml` builds the Docker image, deploys to `etch-staging` first, waits for it to stabilize, then deploys to `etch-cluster`/`etch`). **There is no separate "click deploy" step for production.** The moment the merge commit lands on `main` and CI starts, the prod rollout is already in motion.
- The merge carries **12 pending Prisma migrations** (everything from `20260615190146_init` forward that isn't already on `main`) and **an OAuth scope change**, both detailed below. Neither is a no-op.

## 2. Pre-checks (before merging anything)

- [ ] Confirm `feature/product-options` is green: `npm run build`, `npm run typecheck`, `npm run test:unit` all pass on the exact commit you intend to merge.
- [ ] Confirm every PR merged into `feature/product-options` for this release has been through QA (per this project's normal per-story workflow) and has no known open defects.
- [ ] Confirm the staging environment (already running this code, since staging has tracked `feature/product-options` all along via the manual `deploy-staging-preview.yml` workflow) is currently healthy: check `/healthz` and skim recent CloudWatch logs (`/ecs/etch-staging`) for errors.
- [ ] Pick a low-traffic deploy window. This is a floating-tag deploy (see §5) with no blue/green or canary step; ECS does a rolling replacement of tasks behind the same ALB.
- [ ] Make sure whoever is running this has AWS CLI access to both `etch-cluster` and `etch-staging-cluster`, and a local Shopify CLI session (`shopify auth login`) already authenticated for SL-126's extension deploy (see §6).

## 3. OAuth scope change: merchants will see a re-consent prompt

**Correction to this story's original notes:** the ticket says "no new OAuth scopes required." That was true when the ticket was written, but is no longer accurate as of SL-140.

`main`'s current scopes (`shopify.app.etch.toml`):
```
read_orders,read_products,write_products,write_cart_transforms,write_validations
```

`feature/product-options`'s scopes:
```
read_orders,read_products,write_products,write_cart_transforms,write_validations,read_files,write_files,read_themes
```

Three scopes are new: `read_files`, `write_files` (asset/image uploads, SL-120–122), and `read_themes` (SL-140, widget-activation detection). Existing installs **will** see Shopify's scope-update consent screen on their next admin session after the new app version is released (see §6; this is driven by the extension/app-config deploy, not the ECS web deploy). This is expected, not a bug. `docs/oauth-scopes.md` has been updated alongside this runbook to reflect the current scope list.

## 4. Migrations

12 migrations exist on `feature/product-options` that aren't on `main`, applied automatically via `prisma migrate deploy` at container start (`package.json` → `"start": "node scripts/check-env.mjs && prisma migrate deploy && remix-serve ..."`):

```
20260617103257_add_session_refresh_token
20260627051854_add_space_toggles
20260707125706_add_field_options_and_required
20260707190010_add_swatch_color
20260707220316_add_field_type_extensions
20260708035200_add_pricing_modes_and_field_conditions
20260709162020_add_assets_library
20260709175201_add_template
20260709183958_add_preview_enabled
20260709185421_add_preview_placement
20260710192524_add_font_size_options
20260710195915_add_preview_rotation
20260722180736_sl123_published_snapshot
20260729020833_sl135_option_preview_image
```

All are additive (new tables/columns), consistent with this project's migration history: none of them have been observed to drop or rename existing columns. Still, **verify this directly** against the current `main` schema before cutover: `git diff main...feature/product-options -- prisma/schema.prisma` and read every migration's `.sql` file, not just the names.

Because migrations run inside the container's startup command, a migration failure means the new task fails its health check and never registers as healthy. Confirmed in `terraform/ecs.tf`: the `etch` service has `deployment_circuit_breaker { enable = true; rollback = true }` with `desired_count = 2`, so ECS will automatically stop the failing rollout and roll back to the last known-good task definition without manual intervention. This is a real safety net, not something to verify at incident time.

## 5. Cutover procedure

1. **Merge `feature/product-options` → `main`.** Prefer a merge commit over squash so the individual story history is preserved; either is fine functionally.
2. **Watch the GitHub Actions run** for the `Deploy` workflow (triggered by the push). It has three phases: build/push image (tagged both `:${GIT_SHA}` and `:latest`), deploy to staging, deploy to production. Production only starts after staging reports stable; if staging fails, production never runs.
3. **Watch the production ECS deployment**: `aws ecs describe-services --cluster etch-cluster --services etch`. Wait for `deployments` to show a single `PRIMARY` deployment at `runningCount == desiredCount`, no `FAILED` deployments.
4. **Verify the migration ran cleanly.** Tail the new tasks' logs in CloudWatch (`/ecs/etch` log group) for `prisma migrate deploy` output. Look for `All migrations have been successfully applied` and no error output before the Remix server starts.
5. **Smoke test the web app** against the production URL:
   - `/healthz` returns `{"status":"ok"}`.
   - Open the embedded admin for a real (or the dev) store: home page loads, Products index loads, a product's Fields tab loads and its Live Preview renders.
   - Confirm nothing in the CloudWatch price-mismatch alarm (`${app_name}-price-mismatch-rate-exceeded`, see `terraform/monitoring.tf`) fires immediately post-deploy.
6. **Deploy the theme app extension + Functions** (SL-126, tracked separately; do not skip, the ECS deploy above does not ship these). From a machine with an active `shopify auth login` session:
   ```
   npm run deploy -- --config shopify.app.etch.toml --allow-updates
   ```
   This cuts a new app version and releases it. Confirm the new version is active in the Partner Dashboard, and that a real product page reflects the widget-side changes (e.g. text-block/image-upload behavior from SL-115+).
7. **Re-run the smoke test on the storefront widget** on a real product: add-to-cart pricing math matches what the admin preview shows, and the "Activate widget" flow in the app home page correctly detects the embed (this is what SL-140 fixed, and depends on the new `read_themes` scope actually being granted).

## 6. Rollback

**Trigger:** health check failures, migration errors that block startup, or a smoke-test failure that isn't a quick forward-fix.

**Web app (ECS) rollback:** the ECS task definition (Terraform-managed, `terraform/ecs.tf`) always points at the floating `:latest` tag, so there is no "previous task definition revision" to fall back to by default. Two options, in order of preference:

- **Preferred: revert on `main` and let CI redeploy.** `git revert` the merge commit (or push a revert PR), push to `main`. The normal pipeline rebuilds the previous known-good code as the new `:latest` and rolls it out the same way. This is slower (goes through staging first) but keeps `main` as the source of truth and doesn't require manual ECR/ECS surgery.
- **Faster, manual: re-tag a previous image as `:latest`.** Every past deploy's image is preserved in ECR under its git SHA tag (`deploy.yml` pushes both `:${GIT_SHA}` and `:latest` on every run). Pull the last known-good SHA tag, re-push it as `:latest`:
  ```
  docker pull 394554601568.dkr.ecr.us-east-1.amazonaws.com/etch:<previous-sha>
  docker tag  394554601568.dkr.ecr.us-east-1.amazonaws.com/etch:<previous-sha> 394554601568.dkr.ecr.us-east-1.amazonaws.com/etch:latest
  docker push 394554601568.dkr.ecr.us-east-1.amazonaws.com/etch:latest
  aws ecs update-service --cluster etch-cluster --service etch --force-new-deployment
  ```
  This does not touch `main` and is faster, but leaves `main` pointing at code that's no longer actually deployed until someone does the proper revert. Treat it as a stop-the-bleeding measure, not a substitute for step 5's revert.

**Database rollback:** Prisma migrations applied here are additive. Rolling back the app code does *not* automatically roll back the schema, and it doesn't need to (old code ignores new columns/tables it doesn't know about). Do not attempt to reverse-apply migrations unless a specific migration is confirmed to be destructive on inspection (see §4; verify this before cutover, not during an incident).

**Extensions rollback:** `shopify app deploy` versions are additive too. Releasing a previous app version via the Partner Dashboard (Apps → Etch → Versions) rolls the storefront widget back independently of the web app. Coordinate so the web app and extension versions stay compatible (don't roll one back without checking the other still works against it).

**Owner:** whoever runs the cutover in §5 owns watching it through smoke test and is the default rollback owner unless explicitly handed off before starting.

## 7. Reference

| Item | Value |
|---|---|
| Prod ECS cluster / service | `etch-cluster` / `etch` |
| Staging ECS cluster / service | `etch-staging-cluster` / `etch-staging` |
| ECR repository | `394554601568.dkr.ecr.us-east-1.amazonaws.com/etch` |
| Prod deploy trigger | push to `main` (`.github/workflows/deploy.yml`) |
| Staging deploy trigger | manual `workflow_dispatch` (`.github/workflows/deploy-staging-preview.yml`) |
| Extension deploy trigger | manual, local CLI session only (`.github/workflows/deploy-extensions.yml` is dispatch-only and documents why: Shopify CLI 3.x extension deploys require an OAuth session, which Partners API client tokens can't provide) |
| Health check | `GET /healthz` → `{"status":"ok"}` (checks DB connectivity via `SELECT 1`) |
| Prod app config | `shopify.app.etch.toml` |
| Sibling story | SL-126 (extension deploy, §5 step 6 / §6 extensions rollback) |
