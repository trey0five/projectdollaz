# ─────────────────────────────────────────────────────────────────────────────
# edge — the internet-facing tier. ACM TLS cert (apex + www + origin), an
# internet-facing ALB (reachable only from CloudFront), CloudFront serving the
# SPA from S3 (OAC) and proxying /api/* to the ALB over HTTPS, AWS WAF on the
# distribution, and the Cloudflare DNS records. AWS pieces live in us-east-1
# (required for CloudFront's cert + CLOUDFRONT-scoped WAF); DNS is at Cloudflare.
# ─────────────────────────────────────────────────────────────────────────────
terraform {
  required_providers {
    aws        = { source = "hashicorp/aws" }
    cloudflare = { source = "cloudflare/cloudflare" }
  }
}

variable "prefix" { type = string }
variable "domain_name" { type = string }
variable "cloudflare_zone_id" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "alb_sg_id" { type = string }
variable "spa_bucket_id" { type = string }
variable "spa_bucket_regional_domain" { type = string }
variable "api_container_port" { type = number }

locals {
  origin_host = "origin.${var.domain_name}"
}

# ── ACM certificate (apex + www + ALB origin SAN) ──
resource "aws_acm_certificate" "this" {
  domain_name               = var.domain_name
  subject_alternative_names = ["www.${var.domain_name}", local.origin_host]
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "cloudflare_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.this.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }
  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(each.value.name, ".")
  type    = each.value.type
  content = trimsuffix(each.value.record, ".")
  ttl     = 1
  proxied = false
}

resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for r in cloudflare_record.cert_validation : r.hostname]
}

# ── ALB + target group + HTTPS listener ──
resource "aws_lb" "this" {
  name                       = "${var.prefix}-alb"
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [var.alb_sg_id]
  subnets                    = var.public_subnet_ids
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "api" {
  # name_prefix + create_before_destroy so a protocol change (which forces a new
  # target group) can be swapped in before the old is torn down.
  name_prefix = "oky-tg"
  port        = var.api_container_port
  protocol    = "HTTPS" # end-to-end TLS: the ALB reaches the task over HTTPS
  target_type = "ip"     # Fargate awsvpc
  vpc_id      = var.vpc_id

  health_check {
    path                = "/health"
    protocol            = "HTTPS"
    matcher             = "200"
    interval            = 30
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  deregistration_delay = 30

  lifecycle { create_before_destroy = true }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.this.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ── WAF (CLOUDFRONT scope) ──
resource "aws_wafv2_web_acl" "this" {
  name  = "${var.prefix}-waf"
  scope = "CLOUDFRONT"
  default_action {
    allow {}
  }

  rule {
    name     = "common"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "bad-inputs"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "rate-limit"
    priority = 3
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 2000 # requests / 5 min / IP
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.prefix}-waf"
    sampled_requests_enabled   = true
  }
}

# ── CloudFront ──
# Strip the /api prefix before forwarding to the ALB, so the prefix-less API
# (routes at root: /health, /auth/*) matches — mirrors the Vite dev proxy rewrite.
resource "aws_cloudfront_function" "strip_api" {
  name    = "${var.prefix}-strip-api"
  runtime = "cloudfront-js-2.0"
  comment = "Strip /api prefix for the ALB origin"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (uri.indexOf('/api') === 0) {
        uri = uri.substring(4);
        if (uri.length === 0) { uri = '/'; }
        request.uri = uri;
      }
      return request;
    }
  EOT
}

# SPA client-side routing, done at the EDGE instead of via custom_error_response.
# custom_error_response is DISTRIBUTION-WIDE: mapping 403/404 -> /index.html(200)
# also swallowed every API 403/404, so the app (and any client) received the HTML
# shell with a 200 instead of the real JSON error — e.g. the "verify your email"
# 403 and every not-found. This function rewrites only EXTENSION-LESS paths (the
# client-side routes) to the shell, so S3 serves index.html for deep links while
# /api/* keeps its true status + JSON body. A missing real asset now returns an
# honest 403/404 instead of HTML pretending to be a .js file.
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${var.prefix}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Serve the SPA shell for client-side routes (extension-less paths)"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      // A real file: the last path segment carries an extension
      // (/assets/index-abc.js, /favicon-32.png) -> fetch it from S3 as-is.
      var last = uri.substring(uri.lastIndexOf('/') + 1);
      if (last.indexOf('.') !== -1) {
        return request;
      }
      // Anything else is a client-side route (/governance,
      // /advancement/campaigns/<id>, /) -> serve the SPA shell.
      request.uri = '/index.html';
      return request;
    }
  EOT
}

resource "aws_cloudfront_origin_access_control" "spa" {
  name                              = "${var.prefix}-spa-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "optimized" { name = "Managed-CachingOptimized" }
data "aws_cloudfront_cache_policy" "disabled" { name = "Managed-CachingDisabled" }
data "aws_cloudfront_origin_request_policy" "all_viewer" { name = "Managed-AllViewer" }

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  default_root_object = "index.html"
  aliases             = [var.domain_name, "www.${var.domain_name}"]
  price_class         = "PriceClass_100"
  web_acl_id          = aws_wafv2_web_acl.this.arn

  # SPA origin (S3, private via OAC)
  origin {
    origin_id                = "spa"
    domain_name              = var.spa_bucket_regional_domain
    origin_access_control_id = aws_cloudfront_origin_access_control.spa.id
  }

  # API origin (ALB over HTTPS via origin.<domain>)
  origin {
    origin_id   = "api"
    domain_name = local.origin_host
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "spa"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
    compress                 = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.strip_api.arn
    }
  }

  # NO custom_error_response: it is distribution-wide and would mask real API
  # 403/404s as a 200 HTML shell. SPA deep links are handled by the
  # spa_rewrite viewer-request function on the default behavior instead.

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.this.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# SPA bucket policy: only this CloudFront distribution (via OAC) may read.
data "aws_iam_policy_document" "spa" {
  statement {
    sid       = "AllowCloudFrontOAC"
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::${var.spa_bucket_id}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}
resource "aws_s3_bucket_policy" "spa" {
  bucket = var.spa_bucket_id
  policy = data.aws_iam_policy_document.spa.json
}

# ── Cloudflare DNS records (DNS-only / grey cloud — CloudFront is the CDN) ──
# Apex + www CNAME to CloudFront (Cloudflare flattens the apex CNAME).
resource "cloudflare_record" "apex" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain_name
  type    = "CNAME"
  content = aws_cloudfront_distribution.this.domain_name
  ttl     = 1
  proxied = false
}
resource "cloudflare_record" "www" {
  zone_id = var.cloudflare_zone_id
  name    = "www"
  type    = "CNAME"
  content = aws_cloudfront_distribution.this.domain_name
  ttl     = 1
  proxied = false
}
# origin.<domain> → ALB (the CloudFront /api origin). MUST stay DNS-only so
# CloudFront reaches the ALB directly.
resource "cloudflare_record" "origin" {
  zone_id = var.cloudflare_zone_id
  name    = "origin"
  type    = "CNAME"
  content = aws_lb.this.dns_name
  ttl     = 1
  proxied = false
}

output "cloudfront_domain" { value = aws_cloudfront_distribution.this.domain_name }
output "cloudfront_distribution_arn" { value = aws_cloudfront_distribution.this.arn }
output "alb_dns_name" { value = aws_lb.this.dns_name }
output "target_group_arn" { value = aws_lb_target_group.api.arn }
