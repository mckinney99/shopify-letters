# Infrastructure (Terraform)

Provisions the AWS resources Etch runs on in production:

- **RDS PostgreSQL** (`etch-postgres`) in the private subnets of the shared `modvent-vpc`, credentials in Secrets Manager
- **ECR repository** (`etch`) for the app's Docker image
- **ECS Fargate cluster/service** (`etch-cluster` / `etch`) running the app, in the VPC's public subnets with public IPs (no NAT gateway)
- **Application Load Balancer** (`etch-alb`) routing HTTP traffic to the service and health-checking `/healthz`

This reuses the existing `modvent-vpc` (shared with another project) rather than creating a new VPC, and skips a NAT gateway by placing the Fargate task in a public subnet with a locked-down security group. RDS stays in the private subnets and is only reachable from the ECS task's security group.

## Scope note: HTTP only for now

The ALB currently has only an HTTP (port 80) listener. The ACM certificate, custom domain DNS, and HTTPS listener are covered by **SL-40** (Configure the custom domain and TLS certificate for production) — adding them here would mean standing up a self-signed cert that SL-40 immediately replaces.

## Prerequisites

- Terraform >= 1.5
- AWS CLI configured with credentials that can manage VPC/RDS/ECR/ECS/ALB/IAM/Secrets Manager in the target account
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
- `ecr_repository_url` — push images here
- `rds_endpoint` / `db_secret_arn` — RDS connection info (the full `DATABASE_URL` is in the Secrets Manager secret)

## Placeholder Shopify credentials

`SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` are set to placeholder values (`shopify_api_key_placeholder` / `shopify_api_secret_placeholder` variables) so the container passes `check-env.mjs` and boots. Real production credentials and a Secrets-Manager-backed setup for all app secrets are wired up in **SL-41**.

## Tearing down

```bash
terraform destroy
```

This deletes the RDS instance (no final snapshot — `skip_final_snapshot = true`), ECS service/cluster, ALB, ECR repo (including images), and associated security groups/IAM roles/secrets. It does **not** touch the shared `modvent-vpc` or any `modvent-*` resources.
