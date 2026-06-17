variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "app_name" {
  description = "Short name used to prefix/tag all staging resources."
  type        = string
  default     = "etch-staging"
}

variable "vpc_name" {
  description = "Name tag of the existing VPC (shared with production and the modvent project)."
  type        = string
  default     = "modvent-vpc"
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "image_tag" {
  description = "ECR image tag the staging task should run."
  type        = string
  default     = "latest"
}

variable "db_name" {
  type    = string
  default = "shopify_letters_staging"
}

variable "db_username" {
  type    = string
  default = "etch_staging"
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "db_engine_version" {
  type    = string
  default = "16.14"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "shopify_api_key" {
  description = "Shopify API key for the staging app (ideally a separate dev app at staging.etch.direct)."
  type        = string
  sensitive   = true
}

variable "shopify_api_secret" {
  description = "Shopify API secret for the staging app."
  type        = string
  sensitive   = true
}

variable "shopify_scopes" {
  type    = string
  default = "read_products,write_products,read_orders,write_orders,write_cart_transforms,write_validations"
}

variable "domain_name" {
  description = "Root domain. Staging is served at staging.<domain_name>."
  type        = string
  default     = "etch.direct"
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token (Zone:DNS:Edit on the domain_name zone). Same token as production."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID — visible in the Cloudflare dashboard URL: cloudflare.com/<account_id>/..."
  type        = string
  sensitive   = true
}
