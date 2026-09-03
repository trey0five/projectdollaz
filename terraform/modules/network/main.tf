# ─────────────────────────────────────────────────────────────────────────────
# network — VPC across az_count AZs with three tiers of subnets:
#   public (Fargate tasks w/ public-IP egress), private-app (kept, unused),
# private-db (RDS, no internet route). No NAT, no ALB: ingress is the
# cloudflared sidecar's outbound tunnel; a free S3 gateway endpoint serves the
# private tiers.
# ─────────────────────────────────────────────────────────────────────────────
variable "prefix" { type = string }
variable "vpc_cidr" { type = string }

# ── Village Finders (VF) serverless dependency ──────────────────────────────
# VF's serverless tier (CDK stacks VF-prod-*, /home/dream/village-finder/
# infra-cdk, branch serverless-migration) shares this VPC + RDS instance:
#   - VF lambdas live in the private-app subnets and egress through a VF-owned
#     fck-nat t4g.nano whose STATIC ENI (tag Name=vf-prod-fcknat-eni) becomes
#     this module's app-subnet default route. Strictly an improvement for KYRO
#     too: anything KYRO later launches in the app subnets gets egress again
#     (the old NAT gateway was deleted; this replaces it at ~1/5 the cost).
#   - VF's lambda/fargate SGs get Postgres into the db SG (second logical
#     database `village_finders_prod`, dedicated role, no cross-grants —
#     KYRO's database, role and app SG are untouched).
# Both values are REQUIRED so a plan without the VF resources fails loudly
# instead of silently stripping the route (see the route = [] note below).
variable "vf_nat_eni_id" {
  type        = string
  description = "ENI id of the VF fck-nat instance (CDK-created, tag Name=vf-prod-fcknat-eni)"
}
variable "vf_db_ingress_sg_ids" {
  type        = list(string)
  description = "VF security groups allowed to reach Postgres (vf-prod-lambda-sg, vf-prod-fargate-sg)"
}
variable "az_count" { type = number }
variable "api_container_port" { type = number }

data "aws_availability_zones" "available" { state = "available" }

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${var.prefix}-vpc" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.prefix}-igw" }
}

resource "aws_subnet" "public" {
  count                   = var.az_count
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false
  tags                    = { Name = "${var.prefix}-public-${count.index}", Tier = "public" }
}

resource "aws_subnet" "app" {
  count             = var.az_count
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = local.azs[count.index]
  tags              = { Name = "${var.prefix}-app-${count.index}", Tier = "private-app" }
}

resource "aws_subnet" "db" {
  count             = var.az_count
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 20)
  availability_zone = local.azs[count.index]
  tags              = { Name = "${var.prefix}-db-${count.index}", Tier = "private-db" }
}

# ── No NAT gateway ──
# The Fargate service runs in the PUBLIC subnets with assign_public_ip and an
# ALB-only security group, so nothing needs private-subnet egress any more.
# The NAT (+ its EIP) was ~$37/mo of pure plumbing. If a private-egress need
# ever returns (e.g. the bastion), prefer a temporary NAT or fck-nat instance.
# NOTE: the private-app subnets are kept but have NO default route now — a
# bastion launched there (var.enable_bastion) has no internet egress.

# ── Route tables ──
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = { Name = "${var.prefix}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = var.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private-app subnets: default route via Village Finders' fck-nat instance
# (was `route = []` after the NAT gateway was deleted — that explicit empty
# list existed to strip the old NAT route; it MUST NOT come back, or terraform
# would silently remove the fck-nat route and cut VF's egress: OAuth
# code-exchange, SMTP, Nominatim, OpenAI all die quietly).
resource "aws_route_table" "app" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block           = "0.0.0.0/0"
    network_interface_id = var.vf_nat_eni_id
  }
  tags = { Name = "${var.prefix}-app-rt" }
}

resource "aws_route_table_association" "app" {
  count          = var.az_count
  subnet_id      = aws_subnet.app[count.index].id
  route_table_id = aws_route_table.app.id
}

# DB subnets: no egress route (local-only).
resource "aws_route_table" "db" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.prefix}-db-rt" }
}

resource "aws_route_table_association" "db" {
  count          = var.az_count
  subnet_id      = aws_subnet.db[count.index].id
  route_table_id = aws_route_table.db.id
}

# Free S3 gateway endpoint — keeps document/state S3 traffic off the NAT.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.app.id, aws_route_table.db.id]
  tags              = { Name = "${var.prefix}-s3-endpoint" }
}

data "aws_region" "current" {}

# ── Security groups ──
# No ALB security group: ingress arrives via the cloudflared sidecar's
# OUTBOUND tunnel, so the app tier needs no inbound rules at all.

resource "aws_security_group" "app" {
  name        = "${var.prefix}-app-sg"
  description = "Fargate task ingress from ALB only"
  vpc_id      = aws_vpc.this.id

  # NO ingress rules — the task is reached only through the cloudflared
  # sidecar's outbound tunnel; nothing on the internet can connect in.
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${var.prefix}-app-sg" }
}

resource "aws_security_group" "db" {
  name        = "${var.prefix}-db-sg"
  description = "Postgres ingress from the app tier only"
  vpc_id      = aws_vpc.this.id

  ingress {
    description     = "Postgres from app"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  # Village Finders serverless tier (see the vf_* variable header above):
  # web/task lambdas + the Fargate scraper/telehealth-bridge identity reach the
  # SHARED instance's second logical database `village_finders_prod` only —
  # role-level isolation (dedicated village_finders_app role, REVOKE CONNECT
  # both ways) is enforced by VF's db-bootstrap one-off.
  ingress {
    description     = "Postgres from Village Finders serverless tier"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.vf_db_ingress_sg_ids
  }
  tags = { Name = "${var.prefix}-db-sg" }
}

output "vpc_id" { value = aws_vpc.this.id }
output "public_subnet_ids" { value = aws_subnet.public[*].id }
output "app_subnet_ids" { value = aws_subnet.app[*].id }
output "db_subnet_ids" { value = aws_subnet.db[*].id }
output "app_sg_id" { value = aws_security_group.app.id }
output "db_sg_id" { value = aws_security_group.db.id }
