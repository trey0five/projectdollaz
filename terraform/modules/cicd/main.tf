# ─────────────────────────────────────────────────────────────────────────────
# cicd — GitHub Actions OIDC deploy role. Lets the CD workflow assume a SHORT-LIVED
# role (no static AWS keys in GitHub) scoped to exactly the app-deploy actions:
# push to the API ECR repo, roll the ECS service, sync the SPA bucket, and
# invalidate CloudFront. ARNs are constructed from the naming convention (no module
# cycle). Trust is limited to this repo on main + the `production` environment.
# ─────────────────────────────────────────────────────────────────────────────
variable "prefix" { type = string }

# "owner/repo" of the GitHub repository allowed to assume the role.
variable "github_repo" { type = string }

# The CloudFront distribution ARN (its id is generated, so it can't be constructed
# from the naming convention — passed in from the edge module).
variable "cloudfront_distribution_arn" { type = string }

# In a SHARED account the GitHub OIDC provider may already exist (only one per
# account is allowed). Set this to the existing provider ARN to reuse it; leave
# empty to create it here.
variable "existing_oidc_provider_arn" {
  type    = string
  default = ""
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account = data.aws_caller_identity.current.account_id
  region  = data.aws_region.current.name

  ecr_arn     = "arn:aws:ecr:${local.region}:${local.account}:repository/${var.prefix}-api"
  cluster_arn = "arn:aws:ecs:${local.region}:${local.account}:cluster/${var.prefix}-cluster"
  service_arn = "arn:aws:ecs:${local.region}:${local.account}:service/${var.prefix}-cluster/${var.prefix}-api"
  spa_arn     = "arn:aws:s3:::${var.prefix}-spa"

  oidc_arn = var.existing_oidc_provider_arn != "" ? var.existing_oidc_provider_arn : aws_iam_openid_connect_provider.github[0].arn
}

resource "aws_iam_openid_connect_provider" "github" {
  count           = var.existing_oidc_provider_arn == "" ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

# ── Trust: only this repo, on main or the production environment ──
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:ref:refs/heads/main",
        "repo:${var.github_repo}:environment:production",
      ]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = "${var.prefix}-deploy"
  assume_role_policy   = data.aws_iam_policy_document.assume.json
  max_session_duration = 3600
}

# ── Least-privilege deploy permissions ──
data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # token action is account-scoped by AWS; cannot be resource-scoped
  }
  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
    ]
    resources = [local.ecr_arn]
  }
  statement {
    sid       = "EcsDeploy"
    actions   = ["ecs:UpdateService", "ecs:DescribeServices"]
    resources = [local.service_arn]
  }
  statement {
    sid       = "EcsDescribe"
    actions   = ["ecs:DescribeTaskDefinition"]
    resources = ["*"] # DescribeTaskDefinition does not support resource-level scoping
  }
  statement {
    sid       = "SpaSync"
    actions   = ["s3:PutObject", "s3:DeleteObject", "s3:GetObject", "s3:ListBucket"]
    resources = [local.spa_arn, "${local.spa_arn}/*"]
  }
  statement {
    sid       = "CloudFrontInvalidate"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:ListDistributions"]
    resources = ["*"] # CreateInvalidation/ListDistributions are not resource-scopable pre-lookup
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${var.prefix}-deploy-policy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

output "deploy_role_arn" { value = aws_iam_role.deploy.arn }
