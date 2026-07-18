# ─────────────────────────────────────────────────────────────────────────────
# secrets — the application config secret. Seeded with PLACEHOLDER values, then
# Terraform ignores the secret string so operators set real values out-of-band
# (console/CLI) without a drift loop. KMS-encrypted with the secrets CMK.
# The DB master password is managed separately by RDS (see database module).
# ─────────────────────────────────────────────────────────────────────────────
variable "prefix" { type = string }
variable "kms_secrets_arn" { type = string }

resource "aws_secretsmanager_secret" "app" {
  name        = "${var.prefix}-app"
  description = "Application secrets (JWT, Stripe, QBO, SIS, token keys)."
  kms_key_id  = var.kms_secrets_arn
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    JWT_SECRET             = "REPLACE_ME"
    STRIPE_SECRET_KEY      = "REPLACE_ME"
    STRIPE_WEBHOOK_SECRET  = "REPLACE_ME"
    QB_OAUTH_CLIENT_ID     = "REPLACE_ME"
    QB_OAUTH_CLIENT_SECRET = "REPLACE_ME"
    QBO_TOKEN_KEY          = "REPLACE_ME"
  })

  lifecycle {
    ignore_changes = [secret_string] # real values set out-of-band
  }
}

output "app_secret_arn" { value = aws_secretsmanager_secret.app.arn }
