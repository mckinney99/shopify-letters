# Shopify API credentials for the production app, injected into the ECS
# task via Secrets Manager (see ecs.tf). SHOPIFY_API_KEY matches the
# client_id in shopify.app.etch.toml (not sensitive on its own) but is
# stored alongside SHOPIFY_API_SECRET for convenience. Both come from
# secrets.auto.tfvars (gitignored).

resource "aws_secretsmanager_secret" "shopify" {
  name        = "${var.app_name}/shopify/credentials"
  description = "Shopify API credentials for ${var.app_name}"
}

resource "aws_secretsmanager_secret_version" "shopify" {
  secret_id = aws_secretsmanager_secret.shopify.id
  secret_string = jsonencode({
    SHOPIFY_API_KEY    = var.shopify_api_key
    SHOPIFY_API_SECRET = var.shopify_api_secret
  })
}
