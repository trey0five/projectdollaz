output "cloudfront_domain" {
  description = "CloudFront distribution domain (the app is served here / via the apex once DNS cuts over)."
  value       = module.edge.cloudfront_domain
}

output "alb_dns_name" { value = module.edge.alb_dns_name }

output "ecr_repository_url" {
  description = "Push the API image here (tag = var.api_image_tag)."
  value       = module.compute.ecr_repository_url
}

output "ecs_cluster" { value = module.compute.cluster_name }
output "ecs_service" { value = module.compute.service_name }

output "db_endpoint" { value = module.database.endpoint }

output "app_secret_arn" {
  description = "Populate real values here (JWT/Stripe/QBO/etc.)."
  value       = module.secrets.app_secret_arn
}

output "spa_bucket" {
  description = "Upload the built React SPA here."
  value       = module.storage.spa_bucket_id
}

output "docs_bucket" { value = module.storage.docs_bucket_id }

output "bastion_instance_id" {
  description = "SSM target for the one-time restore (null unless enable_bastion=true)."
  value       = var.enable_bastion ? module.bastion[0].instance_id : null
}

output "restore_port_forward_cmd" {
  description = "Tunnel the private RDS to localhost:5432 through the bastion, then pg_restore from your machine."
  value = var.enable_bastion ? join(" ", [
    "aws ssm start-session --target", module.bastion[0].instance_id,
    "--document-name AWS-StartPortForwardingSessionToRemoteHost",
    "--parameters '{\"host\":[\"${module.database.endpoint}\"],\"portNumber\":[\"5432\"],\"localPortNumber\":[\"5432\"]}'"
  ]) : null
}
