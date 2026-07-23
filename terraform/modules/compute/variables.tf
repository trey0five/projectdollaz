
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
