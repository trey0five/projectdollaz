# ─────────────────────────────────────────────────────────────────────────────
# Bootstrap — remote state backend. Run ONCE with local state, before the main
# stack. Creates the S3 state bucket + DynamoDB lock table the envs/prod backend
# points at. Names are fixed so envs/prod/versions.tf can reference them.
# ─────────────────────────────────────────────────────────────────────────────
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

variable "aws_region" { default = "us-east-1" }
variable "project" { default = "ourkyro" }
variable "environment" { default = "prod" }

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = { Project = var.project, Environment = var.environment, ManagedBy = "terraform" }
  }
}

locals { prefix = "${var.project}-${var.environment}" }

resource "aws_s3_bucket" "state" {
  bucket = "${local.prefix}-tfstate"
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "lock" {
  name         = "${local.prefix}-tflock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"
  attribute {
    name = "LockID"
    type = "S"
  }
}

output "state_bucket" { value = aws_s3_bucket.state.id }
output "lock_table" { value = aws_dynamodb_table.lock.name }
