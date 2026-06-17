output "staging_url" {
  description = "Staging HTTPS URL, served via Cloudflare Tunnel (no ALB)."
  value       = "https://staging.${var.domain_name}"
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.staging.name
}

output "ecs_service_name" {
  value = aws_ecs_service.staging.name
}

output "rds_endpoint" {
  description = "RDS connection endpoint (host:port)."
  value       = aws_db_instance.main.endpoint
}

output "db_secret_arn" {
  description = "Secrets Manager secret holding the staging RDS credentials and DATABASE_URL."
  value       = aws_secretsmanager_secret.db.arn
}

output "shopify_secret_arn" {
  description = "Secrets Manager secret holding the staging Shopify API credentials."
  value       = aws_secretsmanager_secret.shopify.arn
}

output "tunnel_id" {
  description = "Cloudflare Tunnel ID for the staging cloudflared connection."
  value       = cloudflare_tunnel.staging.id
}
