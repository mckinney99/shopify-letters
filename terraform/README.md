# Infrastructure (Terraform)

Provisions the AWS resources Etch runs on in production:

- **RDS PostgreSQL** (`etch-postgres`) in the private subnets of the shared `modvent-vpc`, credentials in Secrets Manager
- **ECR repository** (`etch`) for the app's Docker image
- **ECS Fargate cluster/service** (`etch-cluster` / `etch`) running the app, in the VPC's public subnets with public IPs (no NAT gateway)
- **Application Load Balancer** (`etch-alb`) routing HTTP and HTTPS traffic to the service and health-checking `/healthz`
- **ACM certificate** for `etch.direct`, DNS-validated via Cloudflare (the domain's authoritative DNS provider)
- **Cloudflare DNS record** pointing `etch.direct` at the ALB (DNS-only, not proxied — the browser connects directly to the ALB and terminates TLS with the ACM cert)
- **Secrets Manager secret** (`etch/shopify/credentials`) holding `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`, injected into the ECS task alongside the RDS-backed `DATABASE_URL`

This reuses the existing `modvent-vpc` (shared with another project) rather than creating a new VPC, and skips a NAT gateway by placing the Fargate task in a public subnet with a locked-down security group. RDS stays in the private subnets and is only reachable from the ECS task's security group.

## Secrets setup

Copy `secrets.auto.tfvars.example` to `secrets.auto.tfvars` (gitignored) and fill in real values:

```bash
cp secrets.auto.tfvars.example secrets.auto.tfvars
# edit secrets.auto.tfvars
```

- `cloudflare_api_token` — `etch.direct` is registered in this AWS account's Route 53, but its nameservers are delegated to Cloudflare, so DNS records (ACM validation + the apex record pointing at the ALB) are managed via the Cloudflare Terraform provider. Create a token scoped to **Zone:DNS:Edit** on the `etch.direct` zone.
- `shopify_api_key` / `shopify_api_secret` — same values as `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` in your local `.env`. Stored in the `etch/shopify/credentials` Secrets Manager secret and injected into the ECS task at runtime.

## Prerequisites

- Terraform >= 1.5
- AWS CLI configured with credentials that can manage VPC/RDS/ECR/ECS/ALB/ACM/IAM/Secrets Manager in the target account
- A Cloudflare API token and Shopify app credentials (see above)
- Docker (to build and push the app image)

## Usage

```bash
cd terraform
terraform init
terraform plan -out=tfplan.out
terraform apply tfplan.out
```

State is local (`terraform.tfstate`, gitignored) — there is currently a single operator applying this, so a remote backend (S3 + DynamoDB lock) hasn't been set up yet. If multiple people start running this, migrate to a remote backend first.

### Building and pushing the app image

```bash
cd ..  # repo root
docker build -t etch:latest .

aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin "$(terraform -chdir=terraform output -raw ecr_repository_url | cut -d/ -f1)"

docker tag etch:latest "$(terraform -chdir=terraform output -raw ecr_repository_url):latest"
docker push "$(terraform -chdir=terraform output -raw ecr_repository_url):latest"

# Pick up the new image (ECS will also retry automatically if the
# previous image tag didn't exist yet)
aws ecs update-service --cluster etch-cluster --service etch --force-new-deployment
```

### Useful outputs

```bash
terraform output
```

- `alb_dns_name` — `http://<this>/healthz` should return `{"status":"ok"}` once the service is healthy
- `production_url` — `https://etch.direct` — the production hostname, once DNS has propagated
- `ecr_repository_url` — push images here
- `rds_endpoint` / `db_secret_arn` — RDS connection info (the full `DATABASE_URL` is in the Secrets Manager secret)
- `shopify_secret_arn` — Secrets Manager secret holding `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`
- `acm_certificate_arn` — the validated ACM certificate used by the ALB's HTTPS listener

## Custom domain & TLS

`etch.direct` previously had a CNAME at the zone apex pointing to a Cloudflare Tunnel (the old local-dev-based production setup). Terraform now manages that record (`allow_overwrite = true`) as a CNAME to the ALB, DNS-only (not proxied), so browsers connect directly to the ALB and terminate TLS with the ACM certificate.

## Production secrets & env vars

All values required by `scripts/check-env.mjs` (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`, `DATABASE_URL`) plus `SHOPIFY_APP_URL` are present in the running container: the two Shopify credentials and `DATABASE_URL` come from Secrets Manager via the task definition's `secrets` block (never in plaintext in the image, repo, or Terraform state output); `SCOPES` and `SHOPIFY_APP_URL` are non-sensitive and set directly as task `environment` vars.

The ECS service has `enable_execute_command = true`, so you can shell into the running task to verify the environment directly:

```bash
aws ecs execute-command \
  --cluster etch-cluster --service etch \
  --task "$(aws ecs list-tasks --cluster etch-cluster --service-name etch --query 'taskArns[0]' --output text)" \
  --container etch --interactive --command "node scripts/check-env.mjs"
```

## Monitoring & alerting

Container stdout/stderr ships to the `/ecs/etch` CloudWatch Logs group (via the awslogs driver already configured in the task definition).

A CloudWatch metric filter watches that log group for `price_mismatch_rate_exceeded` events (JSON lines where `$.event = "price_mismatch_rate_exceeded"`, emitted by `app/utils/metrics.ts` when a shop's preview/charged price mismatch rate exceeds 5% over 10+ samples). Each matching line increments the `Etch/Alerts / MismatchAlertCount` metric by 1.

A CloudWatch alarm fires when the metric sum ≥ 1 in any 5-minute window and notifies via SNS email (`var.alert_email`, default `mckinney99@gmail.com`). Confirm the SNS subscription by clicking the link in the email AWS sends after `terraform apply`.

### Verifying the alarm end-to-end

Inject a fake matching log line directly into the production log group, then check the alarm state:

```bash
LOG_STREAM=$(aws logs describe-log-streams \
  --log-group-name /ecs/etch \
  --order-by LastEventTime --descending \
  --query 'logStreams[0].logStreamName' --output text)

aws logs put-log-events \
  --log-group-name /ecs/etch \
  --log-stream-name "$LOG_STREAM" \
  --log-events "[{\"timestamp\": $(date +%s%3N), \"message\": \"{\\\"event\\\":\\\"price_mismatch_rate_exceeded\\\",\\\"ts\\\":\\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\\",\\\"severity\\\":\\\"alert\\\",\\\"shop\\\":\\\"test.myshopify.com\\\",\\\"rate\\\":0.06,\\\"sampleSize\\\":10,\\\"threshold\\\":0.05}\"}]"

# Wait ~1 minute, then check alarm state:
aws cloudwatch describe-alarms \
  --alarm-names "$(terraform output -raw price_mismatch_alarm_name)" \
  --query 'MetricAlarms[0].StateValue' --output text
```

The alarm should transition to `ALARM` and you should receive an email at `var.alert_email`.

## CI/CD pipeline setup

The pipeline is GitHub Actions (`.github/workflows/`). After `terraform apply`:

1. **Get the deploy role ARN:**
   ```bash
   terraform output -raw github_actions_role_arn
   ```

2. **Add GitHub repository secrets** (Settings → Secrets and variables → Actions):
   - `AWS_DEPLOY_ROLE_ARN` — the role ARN from step 1
   - `SHOPIFY_CLI_PARTNERS_TOKEN` — a Shopify Partners API token with `write_apps` scope (create at partners.shopify.com → Settings → Partner API clients)

3. **Enable branch protection** so the CI status check blocks merges on failure:
   ```bash
   gh api repos/mckinney99/shopify-letters/branches/main/protection \
     --method PUT \
     --field required_status_checks='{"strict":true,"contexts":["Lint, typecheck, and test"]}' \
     --field enforce_admins=false \
     --field required_pull_request_reviews=null \
     --field restrictions=null
   ```

The deploy workflow uses OIDC (no long-lived AWS keys stored as secrets). The role is scoped to pushes from `main` only.

ECS deploys use `deployment_circuit_breaker` with auto-rollback: if new tasks fail health checks, ECS rolls back to the previous task definition and the pipeline step fails with a non-zero exit code, so the broken commit is never considered "deployed".

## Tearing down

```bash
terraform destroy
```

This deletes the RDS instance (no final snapshot — `skip_final_snapshot = true`), ECS service/cluster, ALB, ECR repo (including images), and associated security groups/IAM roles/secrets. It does **not** touch the shared `modvent-vpc` or any `modvent-*` resources.
