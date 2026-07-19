# ─────────────────────────────────────────────────────────────────────────────
# security — KMS customer-managed keys (rds / s3 / secrets) + the two ECS IAM
# roles. Policies are scoped by CONSTRUCTED ARNs (from the naming convention) so
# this module has no dependency on storage/secrets — avoids a module cycle.
# ─────────────────────────────────────────────────────────────────────────────
variable "prefix" { type = string }

# Extra principals (e.g. a human break-glass / deploy role ARN) allowed DIRECT
# KMS data-plane use, in addition to the ourkyro roles + the account root.
variable "admin_principal_arns" {
  type    = list(string)
  default = []
}

# SHARED-ACCOUNT isolation: when true (default), the KMS key policies DENY direct
# Encrypt/Decrypt to any non-ourkyro human/user in the account, so another
# tenant's broad IAM identity can't read ourkyro data. Leaves RDS/S3/Secrets
# service integrations untouched. Set false if a first apply hits a KMS error.
variable "enable_kms_isolation" {
  type    = bool
  default = true
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account = data.aws_caller_identity.current.account_id
  region  = data.aws_region.current.name

  docs_bucket_arn = "arn:aws:s3:::${var.prefix}-docs"
  secret_arn_glob = "arn:aws:secretsmanager:${local.region}:${local.account}:secret:${var.prefix}-*"
  # Cross-region inference profiles route to the Anthropic foundation models in
  # several regions, so invoke permission is needed on BOTH the account's
  # inference profiles AND the underlying Anthropic foundation models (any region).
  bedrock_resources = [
    "arn:aws:bedrock:*:${local.account}:inference-profile/*",
    "arn:aws:bedrock:*::foundation-model/anthropic.*",
  ]

  # Constructed (no resource ref → no key↔role cycle). These match the role
  # names created below.
  root_arn           = "arn:aws:iam::${local.account}:root"
  task_role_arn      = "arn:aws:iam::${local.account}:role/${var.prefix}-task"
  task_exec_role_arn = "arn:aws:iam::${local.account}:role/${var.prefix}-task-exec"
  kms_use_principals = concat(
    [local.task_role_arn, local.task_exec_role_arn, local.root_arn],
    var.admin_principal_arns,
  )
}

# ── KMS key policy (shared by all three CMKs) ──
# Root keeps full control (manageability + break-glass, no lockout); the ourkyro
# roles get explicit data-plane use; and — the isolation lever — a DENY blocks
# DIRECT key use by any principal that is NOT an ourkyro role/listed admin, NOT
# an AWS service, and NOT acting via an integrated service (kms:ViaService
# absent). So a broad shared-account user can't `kms:decrypt` ourkyro data
# directly, while RDS/S3/SecretsManager encryption keeps working.
data "aws_iam_policy_document" "kms" {
  statement {
    sid       = "RootAdmin"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = [local.root_arn]
    }
  }
  statement {
    sid       = "OurkyroUse"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*", "kms:ReEncrypt*", "kms:DescribeKey", "kms:CreateGrant"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = [local.task_role_arn, local.task_exec_role_arn]
    }
  }
  dynamic "statement" {
    for_each = var.enable_kms_isolation ? [1] : []
    content {
      sid       = "DenyDirectNonOurkyro"
      effect    = "Deny"
      actions   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*", "kms:ReEncrypt*"]
      resources = ["*"]
      principals {
        type        = "AWS"
        identifiers = ["*"]
      }
      condition {
        test     = "StringNotEquals"
        variable = "aws:PrincipalArn"
        values   = local.kms_use_principals
      }
      condition {
        test     = "Bool"
        variable = "aws:PrincipalIsAWSService"
        values   = ["false"]
      }
      condition {
        test     = "Null"
        variable = "kms:ViaService"
        values   = ["true"] # true = ViaService ABSENT → a direct KMS call
      }
    }
  }
}

# ── KMS keys ──
resource "aws_kms_key" "rds" {
  description             = "${var.prefix} RDS encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 14
  policy                  = data.aws_iam_policy_document.kms.json
}
resource "aws_kms_alias" "rds" {
  name          = "alias/${var.prefix}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

resource "aws_kms_key" "s3" {
  description             = "${var.prefix} S3 encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 14
  policy                  = data.aws_iam_policy_document.kms.json
}
resource "aws_kms_alias" "s3" {
  name          = "alias/${var.prefix}-s3"
  target_key_id = aws_kms_key.s3.key_id
}

resource "aws_kms_key" "secrets" {
  description             = "${var.prefix} Secrets Manager encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 14
  policy                  = data.aws_iam_policy_document.kms.json
}
resource "aws_kms_alias" "secrets" {
  name          = "alias/${var.prefix}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# ── ECS task execution role (pull image, write logs, inject secrets) ──
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${var.prefix}-task-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Lets the execution role decrypt secrets at container start + read them. Covers
# BOTH the app secret (ourkyro-prod-*) AND the RDS-managed master-password secret
# (AWS names it `rds!db-<id>`, which doesn't match the app glob).
data "aws_iam_policy_document" "exec_secrets" {
  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      local.secret_arn_glob,
      "arn:aws:secretsmanager:${local.region}:${local.account}:secret:rds!*",
    ]
  }
  statement {
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.secrets.arn]
  }
}

resource "aws_iam_role_policy" "exec_secrets" {
  name   = "${var.prefix}-exec-secrets"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.exec_secrets.json
}

# ── ECS task role (application runtime permissions) ──
resource "aws_iam_role" "task" {
  name               = "${var.prefix}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

data "aws_iam_policy_document" "task" {
  # Document store
  statement {
    sid       = "S3Docs"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [local.docs_bucket_arn, "${local.docs_bucket_arn}/*"]
  }
  statement {
    sid       = "S3KmsUse"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt", "kms:Encrypt"]
    resources = [aws_kms_key.s3.arn]
  }
  # Secrets at runtime
  statement {
    sid       = "ReadSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [local.secret_arn_glob]
  }
  statement {
    sid       = "SecretsKmsUse"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.secrets.arn]
  }
  # Bedrock (Claude) — the in-account LLM path
  statement {
    sid       = "BedrockInvoke"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = local.bedrock_resources
  }
  # Polly TTS
  statement {
    sid       = "Polly"
    actions   = ["polly:SynthesizeSpeech"]
    resources = ["*"]
  }
  # SES email
  statement {
    sid       = "SES"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "task" {
  name   = "${var.prefix}-task-policy"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}

output "kms_rds_arn" { value = aws_kms_key.rds.arn }
output "kms_s3_arn" { value = aws_kms_key.s3.arn }
output "kms_secrets_arn" { value = aws_kms_key.secrets.arn }
output "task_execution_role_arn" { value = aws_iam_role.task_execution.arn }
output "task_role_arn" { value = aws_iam_role.task.arn }
