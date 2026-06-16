variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Short name used to prefix/tag all resources for this app."
  type        = string
  default     = "etch"
}

variable "vpc_name" {
  description = "Name tag of the existing VPC to deploy into (shared with the modvent project)."
  type        = string
  default     = "modvent-vpc"
}

variable "container_port" {
  description = "Port the app listens on inside the container (matches Dockerfile EXPOSE)."
  type        = number
  default     = 3000
}

variable "image_tag" {
  description = "Tag of the image in ECR that the ECS task definition should run."
  type        = string
  default     = "latest"
}

variable "db_name" {
  description = "Name of the application database created on the RDS instance."
  type        = string
  default     = "shopify_letters"
}

variable "db_username" {
  description = "Master username for the RDS instance."
  type        = string
  default     = "etch_app"
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t3.micro"
}

variable "db_engine_version" {
  description = "Postgres engine version for RDS."
  type        = string
  default     = "16.14"
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS, in GiB."
  type        = number
  default     = 20
}

variable "shopify_api_key" {
  description = "Shopify app API key (client_id from shopify.app.etch.toml). Set via secrets.auto.tfvars (gitignored)."
  type        = string
  sensitive   = true
}

variable "shopify_api_secret" {
  description = "Shopify app API secret. Set via secrets.auto.tfvars (gitignored)."
  type        = string
  sensitive   = true
}

variable "shopify_scopes" {
  description = "Comma-separated Shopify API scopes (matches .env.example, not sensitive)."
  type        = string
  default     = "read_products,write_products,read_orders,write_orders,write_cart_transforms,write_validations"
}

variable "domain_name" {
  description = "Production hostname for the app (matches application_url in shopify.app.etch.toml)."
  type        = string
  default     = "etch.direct"
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token (Zone:DNS:Edit on the domain_name zone). Set via secrets.auto.tfvars (gitignored)."
  type        = string
  sensitive   = true
}

variable "alert_email" {
  description = "Email address to notify when the price_mismatch_rate_exceeded alarm fires."
  type        = string
  default     = "mckinney99@gmail.com"
}
