# ─────────────────────────────────────────────────────────────────────────────
# storage — three buckets:
#   docs      : uploaded documents. SSE-KMS enforced, TLS-only, versioned, BPA,
#               access-logged. The highest-sensitivity object store.
#   logs      : S3 access logs for the docs + spa buckets.
#   spa       : the built React SPA, private, served only via CloudFront (OAC).
# All buckets: Block Public Access on, bucket-policy DENY for non-TLS and
# unencrypted puts.
# ─────────────────────────────────────────────────────────────────────────────
variable "prefix" { type = string }
variable "kms_s3_arn" { type = string }

# ── Access-log bucket ──
resource "aws_s3_bucket" "logs" {
  bucket = "${var.prefix}-logs"
}
resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_ownership_controls" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule { object_ownership = "BucketOwnerPreferred" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    id     = "expire-logs"
    status = "Enabled"
    filter {}
    expiration { days = 365 }
  }
}

# ── Documents bucket ──
resource "aws_s3_bucket" "docs" {
  bucket = "${var.prefix}-docs"
}
resource "aws_s3_bucket_public_access_block" "docs" {
  bucket                  = aws_s3_bucket.docs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_versioning" "docs" {
  bucket = aws_s3_bucket.docs.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "docs" {
  bucket = aws_s3_bucket.docs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_s3_arn
    }
    bucket_key_enabled = true
  }
}
resource "aws_s3_bucket_logging" "docs" {
  bucket        = aws_s3_bucket.docs.id
  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "docs/"
}

data "aws_iam_policy_document" "docs" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.docs.arn, "${aws_s3_bucket.docs.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
  statement {
    sid       = "DenyUnencryptedPuts"
    effect    = "Deny"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.docs.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["aws:kms"]
    }
  }
}
resource "aws_s3_bucket_policy" "docs" {
  bucket = aws_s3_bucket.docs.id
  policy = data.aws_iam_policy_document.docs.json
}

# ── SPA bucket (private; CloudFront OAC reads it) ──
resource "aws_s3_bucket" "spa" {
  bucket = "${var.prefix}-spa"
}
resource "aws_s3_bucket_public_access_block" "spa" {
  bucket                  = aws_s3_bucket.spa.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_versioning" "spa" {
  bucket = aws_s3_bucket.spa.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "spa" {
  bucket = aws_s3_bucket.spa.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

output "docs_bucket_id" { value = aws_s3_bucket.docs.id }
output "docs_bucket_arn" { value = aws_s3_bucket.docs.arn }
output "spa_bucket_id" { value = aws_s3_bucket.spa.id }
output "spa_bucket_arn" { value = aws_s3_bucket.spa.arn }
output "spa_bucket_regional_domain" { value = aws_s3_bucket.spa.bucket_regional_domain_name }
