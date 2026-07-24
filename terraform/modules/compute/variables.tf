
variable "admin_emails" {
  description = "Comma-separated platform-admin emails (ADMIN_EMAILS). May be empty."
  type        = string
  default     = ""
}

variable "superadmin_username" {
  description = "Username of the bootstrap super-admin (SUPERADMIN_USERNAME)."
  type        = string
  default     = "tmunroe1"
}

variable "brevo_smtp_user" {
  description = "Brevo SMTP login (SMTP_USER) — from Brevo dashboard → SMTP & API → SMTP. Not secret; the SMTP key (SMTP_PASS) lives in the ourkyro-prod-app secret."
  type        = string
  default     = ""
}
