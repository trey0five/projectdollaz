variable "project" {
  type    = string
  default = "ourkyro"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "domain_name" {
  type        = string
  description = "Apex domain served via CloudFront."
  default     = "ourkyro.com"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "az_count" {
  type        = number
  description = "AZs to span. 2 is the minimum ALB/RDS-subnet-group requirement even in single-AZ mode."
  default     = 2
}

# ── Database ──
variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "db_engine_version" {
  type    = string
  default = "16"
}

variable "db_name" {
  type    = string
  default = "finrep"
}

variable "db_username" {
  type    = string
  default = "finrep"
}

# ── API (Fargate) ──
variable "api_cpu" {
  type        = number
  description = "Fargate CPU units. 512 = 0.5 vCPU."
  default     = 512
}

variable "api_memory" {
  type    = number
  default = 1024
}

variable "api_container_port" {
  type    = number
  default = 8000
}

variable "api_image_tag" {
  type        = string
  description = "Tag of the API image in ECR the service runs."
  default     = "latest"
}

variable "api_desired_count" {
  type    = number
  default = 1
}

# ── AI ──
variable "bedrock_model_ids" {
  type        = list(string)
  description = "Bedrock inference-profile IDs the app invokes (first = default). Current Claude models need the cross-region `us.` inference-profile form for on-demand Converse."
  default = [
    "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  ]
}

# ── Shared-account KMS isolation ──
variable "enable_kms_isolation" {
  type        = bool
  description = "Deny direct KMS use of ourkyro keys to non-ourkyro identities (for a shared account). Set false only if a first apply hits a KMS error."
  default     = true
}

variable "kms_admin_principal_arns" {
  type        = list(string)
  description = "Extra IAM ARNs (e.g. a human break-glass/deploy role) allowed direct KMS data-plane use, beyond the ourkyro roles + account root."
  default     = []
}

# ── Cloudflare DNS ──
variable "cloudflare_api_token" {
  type        = string
  description = "Cloudflare API token (Zone > DNS > Edit for ourkyro.com). Pass via TF_VAR_cloudflare_api_token — never commit it."
  sensitive   = true
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare Zone ID for ourkyro.com (not secret)."
}

# ── One-time migration bastion ──
variable "enable_bastion" {
  type        = bool
  description = "Spin up an SSM-only jump host to restore the pg_dump into the private RDS. Set true → apply → restore → set false → apply (destroys it)."
  default     = false
}

# ── CI/CD (GitHub Actions OIDC deploy role) ──
variable "github_repo" {
  description = "owner/repo allowed to assume the CD deploy role (e.g. torreymunroe/kyro)"
  type        = string
  default     = ""
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider ARN to reuse (shared account). Empty = create it."
  type        = string
  default     = ""
}

# ── Outbound email (Brevo SMTP relay) ──
variable "brevo_smtp_user" {
  description = "Brevo SMTP login (SMTP_USER) from Brevo → SMTP & API → SMTP. The SMTP key (SMTP_PASS) is a secret in ourkyro-prod-app, not here."
  type        = string
  default     = ""
}
