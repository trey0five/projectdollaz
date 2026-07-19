# ─────────────────────────────────────────────────────────────────────────────
# database — RDS PostgreSQL, lean single-AZ, encrypted at rest (KMS), TLS
# ENFORCED (rds.force_ssl=1), private subnets, 7-day PITR, deletion protection,
# RDS-managed master password (auto-stored in its own KMS-encrypted secret).
# ─────────────────────────────────────────────────────────────────────────────
variable "prefix" { type = string }
variable "db_subnet_ids" { type = list(string) }
variable "db_sg_id" { type = string }
variable "kms_rds_arn" { type = string }
variable "kms_secrets_arn" { type = string }
variable "instance_class" { type = string }
variable "allocated_storage" { type = number }
variable "engine_version" { type = string }
variable "db_name" { type = string }
variable "db_username" { type = string }

resource "aws_db_subnet_group" "this" {
  name       = "${var.prefix}-db-subnets"
  subnet_ids = var.db_subnet_ids
}

# Force TLS for every client connection.
resource "aws_db_parameter_group" "this" {
  name   = "${var.prefix}-pg16"
  family = "postgres16"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_connections"
    value = "1"
  }
  parameter {
    name  = "log_disconnections"
    value = "1"
  }
}

resource "aws_db_instance" "this" {
  identifier     = "${var.prefix}-pg"
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.allocated_storage * 3
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_rds_arn

  db_name  = var.db_name
  username = var.db_username

  # RDS manages + rotates the master password into its own KMS-encrypted secret.
  manage_master_user_password   = true
  master_user_secret_kms_key_id = var.kms_secrets_arn

  multi_az               = false # lean single-AZ (flip to true for HA later)
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.db_sg_id]
  parameter_group_name   = aws_db_parameter_group.this.name

  backup_retention_period = 7 # enables point-in-time recovery
  backup_window           = "07:00-08:00"
  maintenance_window      = "Sun:08:30-Sun:09:30"
  copy_tags_to_snapshot   = true

  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${var.prefix}-pg-final"
  auto_minor_version_upgrade = true
}

output "endpoint" { value = aws_db_instance.this.address }
output "port" { value = aws_db_instance.this.port }
output "db_name" { value = var.db_name }
output "master_user_secret_arn" {
  value = aws_db_instance.this.master_user_secret[0].secret_arn
}
