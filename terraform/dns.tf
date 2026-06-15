# ACM certificate for the production custom domain, validated via DNS
# records in Cloudflare (the authoritative DNS provider for var.domain_name -
# the Route 53 hosted zone for this domain exists but isn't delegated to).

data "cloudflare_zone" "app" {
  name = var.domain_name
}

resource "aws_acm_certificate" "app" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.app_name}-cert"
  }
}

resource "cloudflare_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.app.domain_validation_options : dvo.domain_name => {
      name  = trimsuffix(dvo.resource_record_name, ".")
      type  = dvo.resource_record_type
      value = trimsuffix(dvo.resource_record_value, ".")
    }
  }

  zone_id = data.cloudflare_zone.app.id
  name    = each.value.name
  type    = each.value.type
  content = each.value.value
  ttl     = 60
  proxied = false
}

resource "aws_acm_certificate_validation" "app" {
  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [for record in cloudflare_record.cert_validation : record.hostname]
}

# Apex record pointing the production domain at the ALB. DNS-only (not
# proxied through Cloudflare) so the browser connects directly to the ALB
# and terminates TLS using the ACM certificate above.
#
# allow_overwrite: the apex previously held a CNAME to a Cloudflare Tunnel
# (the old local-dev-based production setup per SL-35) which this replaces.
resource "cloudflare_record" "app" {
  zone_id         = data.cloudflare_zone.app.id
  name            = "@"
  type            = "CNAME"
  content         = aws_lb.app.dns_name
  ttl             = 300
  proxied         = false
  allow_overwrite = true
}
