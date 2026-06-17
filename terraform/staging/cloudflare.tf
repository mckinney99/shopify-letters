resource "random_id" "tunnel_secret" {
  byte_length = 32
}

# Cloudflare Tunnel replaces the ALB for staging. cloudflared runs as a
# sidecar in the ECS task and makes outbound-only connections to Cloudflare's
# edge - no inbound ports, no ACM cert, no ALB needed.
#
# Requires a Cloudflare API token with BOTH:
#   - Zone:DNS:Edit  (for the cloudflare_record below)
#   - Account:Cloudflare Tunnel:Edit  (for the tunnel itself)
resource "cloudflare_zero_trust_tunnel_cloudflared" "staging" {
  account_id = var.cloudflare_account_id
  name       = "etch-staging"
  secret     = random_id.tunnel_secret.b64_std
  config_src = "cloudflare"
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "staging" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.staging.id

  config {
    ingress_rule {
      hostname = "staging.${var.domain_name}"
      service  = "http://localhost:${var.container_port}"
    }
    ingress_rule {
      service = "http_status:404"
    }
  }
}

# CNAME -> <tunnel-id>.cfargotunnel.com, proxied through Cloudflare.
# TLS is terminated by Cloudflare; no ACM cert needed.
resource "cloudflare_record" "staging" {
  zone_id = data.cloudflare_zone.app.id
  name    = "staging"
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.staging.id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
}
