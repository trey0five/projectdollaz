# ─────────────────────────────────────────────────────────────────────────────
# envs/prod — wires the modules into the lean single-AZ FERPA stack.
# ─────────────────────────────────────────────────────────────────────────────
locals {
  prefix = "${var.project}-${var.environment}"
}

module "network" {
  source             = "../../modules/network"
  prefix             = local.prefix
  vpc_cidr           = var.vpc_cidr
  az_count           = var.az_count
  api_container_port = var.api_container_port
}

module "security" {
  source               = "../../modules/security"
  prefix               = local.prefix
  admin_principal_arns = var.kms_admin_principal_arns
  enable_kms_isolation = var.enable_kms_isolation
}

module "secrets" {
  source          = "../../modules/secrets"
  prefix          = local.prefix
  kms_secrets_arn = module.security.kms_secrets_arn
}

module "storage" {
  source     = "../../modules/storage"
  prefix     = local.prefix
  kms_s3_arn = module.security.kms_s3_arn
}

module "database" {
  source            = "../../modules/database"
  prefix            = local.prefix
  db_subnet_ids     = module.network.db_subnet_ids
  db_sg_id          = module.network.db_sg_id
  kms_rds_arn       = module.security.kms_rds_arn
  kms_secrets_arn   = module.security.kms_secrets_arn
  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  engine_version    = var.db_engine_version
  db_name           = var.db_name
  db_username       = var.db_username
}

module "email" {
  source             = "../../modules/email"
  prefix             = local.prefix
  domain_name        = var.domain_name
  cloudflare_zone_id = var.cloudflare_zone_id
}

module "edge" {
  source                     = "../../modules/edge"
  prefix                     = local.prefix
  domain_name                = var.domain_name
  cloudflare_zone_id         = var.cloudflare_zone_id
  vpc_id                     = module.network.vpc_id
  public_subnet_ids          = module.network.public_subnet_ids
  alb_sg_id                  = module.network.alb_sg_id
  spa_bucket_id              = module.storage.spa_bucket_id
  spa_bucket_regional_domain = module.storage.spa_bucket_regional_domain
  api_container_port         = var.api_container_port
}

module "compute" {
  source                  = "../../modules/compute"
  prefix                  = local.prefix
  app_subnet_ids          = module.network.app_subnet_ids
  app_sg_id               = module.network.app_sg_id
  task_execution_role_arn = module.security.task_execution_role_arn
  task_role_arn           = module.security.task_role_arn
  target_group_arn        = module.edge.target_group_arn

  api_cpu            = var.api_cpu
  api_memory         = var.api_memory
  api_container_port = var.api_container_port
  api_image_tag      = var.api_image_tag
  api_desired_count  = var.api_desired_count

  domain_name          = var.domain_name
  db_endpoint          = module.database.endpoint
  db_port              = module.database.port
  db_name              = module.database.db_name
  db_master_secret_arn = module.database.master_user_secret_arn
  app_secret_arn       = module.secrets.app_secret_arn
  docs_bucket_id       = module.storage.docs_bucket_id
  bedrock_model_id     = var.bedrock_model_ids[0]
  brevo_smtp_user      = var.brevo_smtp_user

  # Ensure the ALB listener exists before the service registers with the TG.
  depends_on = [module.edge]
}

module "audit" {
  source = "../../modules/audit"
  prefix = local.prefix
}

# One-time restore jump host (var.enable_bastion). Uses a private-app subnet +
# the app SG so it can reach RDS via SSM only. Destroy it after the restore.
module "bastion" {
  count     = var.enable_bastion ? 1 : 0
  source    = "../../modules/bastion"
  prefix    = local.prefix
  subnet_id = module.network.app_subnet_ids[0]
  app_sg_id = module.network.app_sg_id
}

# GitHub Actions OIDC deploy role — the identity the CD workflow assumes (no static
# keys). Put its ARN in the repo secret AWS_DEPLOY_ROLE_ARN.
module "cicd" {
  source                      = "../../modules/cicd"
  prefix                      = local.prefix
  github_repo                 = var.github_repo
  cloudfront_distribution_arn = module.edge.cloudfront_distribution_arn
  existing_oidc_provider_arn  = var.github_oidc_provider_arn
}
