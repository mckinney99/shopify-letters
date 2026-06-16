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

output "shopify_secret_arn" {
  description = "Secrets Manager secret holding the Shopify API credentials."
  value       = aws_secretsmanager_secret.shopify.arn
}

output "ecs_task_id" {
  description = "Running task ID, for `aws ecs execute-command` (see README)."
  value       = "Run: aws ecs list-tasks --cluster ${aws_ecs_cluster.main.name} --service-name ${aws_ecs_service.app.name}"
}

output "production_url" {
  description = "Production HTTPS URL for the app, once DNS has propagated."
  value       = "https://${var.domain_name}"
}

output "acm_certificate_arn" {
  description = "Validated ACM certificate used by the ALB's HTTPS listener."
  value       = aws_acm_certificate_validation.app.certificate_arn
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC. Set as AWS_DEPLOY_ROLE_ARN in repository secrets."
  value       = aws_iam_role.github_actions.arn
}
