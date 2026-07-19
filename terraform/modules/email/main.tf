# ─────────────────────────────────────────────────────────────────────────────
# email — Amazon SES domain identity + DKIM, with the verification/DKIM/SPF
# records published into Cloudflare DNS. Replaces the external Brevo SMTP.
# NOTE: new SES accounts start in the SANDBOX — request production sending from
# the SES console before real customer email flows.
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

data "aws_region" "current" {}

resource "aws_ses_domain_identity" "this" {
  domain = var.domain_name
}

resource "cloudflare_record" "verification" {
  zone_id = var.cloudflare_zone_id
  name    = "_amazonses"
  type    = "TXT"
  content = aws_ses_domain_identity.this.verification_token
  ttl     = 1
}

resource "aws_ses_domain_identity_verification" "this" {
  domain     = aws_ses_domain_identity.this.id
  depends_on = [cloudflare_record.verification]
}

resource "aws_ses_domain_dkim" "this" {
  domain = aws_ses_domain_identity.this.domain
}

resource "cloudflare_record" "dkim" {
  count   = 3
  zone_id = var.cloudflare_zone_id
  name    = "${aws_ses_domain_dkim.this.dkim_tokens[count.index]}._domainkey"
  type    = "CNAME"
  content = "${aws_ses_domain_dkim.this.dkim_tokens[count.index]}.dkim.amazonses.com"
  ttl     = 1
  proxied = false
}

# Custom MAIL FROM (SPF alignment) at mail.<domain>.
resource "aws_ses_domain_mail_from" "this" {
  domain           = aws_ses_domain_identity.this.domain
  mail_from_domain = "mail.${var.domain_name}"
}

resource "cloudflare_record" "mail_from_mx" {
  zone_id  = var.cloudflare_zone_id
  name     = "mail"
  type     = "MX"
  content  = "feedback-smtp.${data.aws_region.current.name}.amazonses.com"
  priority = 10
  ttl      = 1
}

resource "cloudflare_record" "mail_from_spf" {
  zone_id = var.cloudflare_zone_id
  name    = "mail"
  type    = "TXT"
  content = "v=spf1 include:amazonses.com -all"
  ttl     = 1
}

output "ses_identity_arn" { value = aws_ses_domain_identity.this.arn }
