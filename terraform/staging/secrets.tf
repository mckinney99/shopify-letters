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

# The tunnel_token attribute on cloudflare_tunnel gives the complete token
# string that cloudflared needs to authenticate with the Cloudflare edge.
# It's stored in Secrets Manager and injected into the cloudflared container
# as TUNNEL_TOKEN at task launch.
resource "aws_secretsmanager_secret" "tunnel_token" {
  name        = "${var.app_name}/cloudflare/tunnel-token"
  description = "Cloudflare Tunnel token for the ${var.app_name} cloudflared sidecar"
}

resource "aws_secretsmanager_secret_version" "tunnel_token" {
  secret_id     = aws_secretsmanager_secret.tunnel_token.id
  secret_string = cloudflare_zero_trust_tunnel_cloudflared.staging.tunnel_token
}
