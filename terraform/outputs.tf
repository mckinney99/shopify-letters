output "alb_dns_name" {
  description = "Public DNS name of the load balancer. http://<this>/healthz should return 200 once the service is healthy."
  value       = aws_lb.app.dns_name
}

output "ecr_repository_url" {
  description = "Push images here, e.g. docker push <this>:latest"
  value       = aws_ecr_repository.app.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.app.name
}

output "rds_endpoint" {
  description = "RDS connection endpoint (host:port)."
  value       = aws_db_instance.main.endpoint
}

output "db_secret_arn" {
  description = "Secrets Manager secret holding the RDS credentials and DATABASE_URL."
  value       = aws_secretsmanager_secret.db.arn
}

output "production_url" {
  description = "Production HTTPS URL for the app, once DNS has propagated."
  value       = "https://${var.domain_name}"
}

output "acm_certificate_arn" {
  description = "Validated ACM certificate used by the ALB's HTTPS listener."
  value       = aws_acm_certificate_validation.app.certificate_arn
}
