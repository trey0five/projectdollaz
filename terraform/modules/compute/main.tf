# ─────────────────────────────────────────────────────────────────────────────
# compute — ECR + ECS Fargate. One API service in the private-app subnets (no
# public IP; egress via the shared NAT). Secrets are injected at runtime from
# Secrets Manager (app secret) and the RDS-managed master secret. Autoscaling
# 1→2 on CPU. Logs to CloudWatch.
# ─────────────────────────────────────────────────────────────────────────────
variable "prefix" { type = string }
variable "app_subnet_ids" { type = list(string) }
variable "app_sg_id" { type = string }
variable "task_execution_role_arn" { type = string }
variable "task_role_arn" { type = string }
variable "target_group_arn" { type = string }

variable "api_cpu" { type = number }
variable "api_memory" { type = number }
variable "api_container_port" { type = number }
variable "api_image_tag" { type = string }
variable "api_desired_count" { type = number }
variable "log_retention_days" {
  type    = number
  default = 30
}

# Runtime config
variable "domain_name" { type = string }
variable "db_endpoint" { type = string }
variable "db_port" { type = number }
variable "db_name" { type = string }
variable "db_master_secret_arn" { type = string }
variable "app_secret_arn" { type = string }
variable "docs_bucket_id" { type = string }
variable "docs_prefix" {
  type    = string
  default = "finrep/documents"
}
variable "bedrock_model_id" { type = string }

data "aws_region" "current" {}

resource "aws_ecr_repository" "api" {
  name                 = "${var.prefix}-api"
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Expire untagged images after 14 days"
      selection    = { tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = 14 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.prefix}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "this" {
  name = "${var.prefix}-cluster"
  setting {
    name  = "containerInsights"
    value = "disabled" # cost — enable later if wanted
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = var.task_execution_role_arn
  task_role_arn            = var.task_role_arn
  runtime_platform {
    # X86_64 for a fast native image build on an x86 host. Switch back to ARM64
    # (Graviton, ~20% cheaper) once you have an arm64 build in CI.
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name         = "api"
    image        = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"
    essential    = true
    portMappings = [{ containerPort = var.api_container_port, protocol = "tcp" }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = tostring(var.api_container_port) },
      { name = "WEB_ORIGIN", value = "https://${var.domain_name}" },
      { name = "AWS_REGION", value = data.aws_region.current.name },
      { name = "DATABASE_HOST", value = var.db_endpoint },
      { name = "DATABASE_PORT", value = tostring(var.db_port) },
      { name = "DATABASE_NAME", value = var.db_name },
      { name = "S3_DOCUMENTS_BUCKET", value = var.docs_bucket_id },
      { name = "S3_DOCUMENTS_PREFIX", value = var.docs_prefix },
      { name = "BEDROCK_MODEL_ID", value = var.bedrock_model_id },
      # Outbound mail via Amazon SES (SDK uses the task role — no SMTP creds).
      { name = "MAIL_PROVIDER", value = "ses" },
      { name = "MAIL_FROM", value = "KYRO <noreply@${var.domain_name}>" },
    ]

    # App must assemble DATABASE_URL as:
    #   postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}?sslmode=require
    secrets = [
      { name = "DATABASE_USER", valueFrom = "${var.db_master_secret_arn}:username::" },
      { name = "DATABASE_PASSWORD", valueFrom = "${var.db_master_secret_arn}:password::" },
      { name = "JWT_SECRET", valueFrom = "${var.app_secret_arn}:JWT_SECRET::" },
      { name = "STRIPE_SECRET_KEY", valueFrom = "${var.app_secret_arn}:STRIPE_SECRET_KEY::" },
      { name = "STRIPE_WEBHOOK_SECRET", valueFrom = "${var.app_secret_arn}:STRIPE_WEBHOOK_SECRET::" },
      { name = "QB_OAUTH_CLIENT_ID", valueFrom = "${var.app_secret_arn}:QB_OAUTH_CLIENT_ID::" },
      { name = "QB_OAUTH_CLIENT_SECRET", valueFrom = "${var.app_secret_arn}:QB_OAUTH_CLIENT_SECRET::" },
      { name = "QBO_TOKEN_KEY", valueFrom = "${var.app_secret_arn}:QBO_TOKEN_KEY::" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "${var.prefix}-api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.app_subnet_ids
    security_groups  = [var.app_sg_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "api"
    container_port   = var.api_container_port
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  lifecycle {
    ignore_changes = [task_definition] # CI updates the task def / image out-of-band
  }
}

# ── Autoscaling 1 → 2 on CPU ──
resource "aws_appautoscaling_target" "api" {
  max_capacity       = 2
  min_capacity       = var.api_desired_count
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.prefix}-cpu-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

output "ecr_repository_url" { value = aws_ecr_repository.api.repository_url }
output "cluster_name" { value = aws_ecs_cluster.this.name }
output "service_name" { value = aws_ecs_service.api.name }
