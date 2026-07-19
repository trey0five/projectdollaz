# ─────────────────────────────────────────────────────────────────────────────
# bastion — a throwaway jump host for the one-time pg_dump restore into the
# PRIVATE RDS. Reached ONLY via SSM Session Manager (no inbound ports, no SSH
# keys, no public IP). It wears the app security group, so the db security group
# already permits it to reach Postgres. Gated by var.enable_bastion at the root:
# set true → apply → restore → set false → apply (destroys it).
#
# Usage (SSM port-forward RDS to your laptop, then restore from the laptop):
#   aws ssm start-session --target <instance_id> \
#     --document-name AWS-StartPortForwardingSessionToRemoteHost \
#     --parameters '{"host":["<rds-endpoint>"],"portNumber":["5432"],"localPortNumber":["5432"]}'
#   pg_restore --no-owner --no-privileges --clean --if-exists \
#     -d "postgresql://finrep:<pw>@localhost:5432/finrep?sslmode=require" finrep.dump
# ─────────────────────────────────────────────────────────────────────────────
variable "prefix" { type = string }
variable "subnet_id" {
  type        = string
  description = "A private-app subnet (has the NAT route SSM needs)."
}
variable "app_sg_id" {
  type        = string
  description = "The app SG — the db SG already allows it to reach RDS."
}
variable "instance_type" {
  type    = string
  default = "t4g.nano"
}

# Latest Amazon Linux 2023 (arm64) — ships the SSM agent preinstalled.
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "bastion" {
  name               = "${var.prefix}-bastion"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "bastion" {
  name = "${var.prefix}-bastion"
  role = aws_iam_role.bastion.name
}

resource "aws_instance" "bastion" {
  ami                         = data.aws_ssm_parameter.al2023.value
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [var.app_sg_id]
  iam_instance_profile        = aws_iam_instance_profile.bastion.name
  associate_public_ip_address = false

  metadata_options {
    http_tokens   = "required" # IMDSv2 only
    http_endpoint = "enabled"
  }

  root_block_device {
    encrypted   = true
    volume_size = 8
    volume_type = "gp3"
  }

  # Install the Postgres 16 client so a restore can also run on-box if preferred.
  user_data = <<-EOF
    #!/bin/bash
    dnf install -y postgresql16 || dnf install -y postgresql15 || true
  EOF

  tags = { Name = "${var.prefix}-bastion" }
}

output "instance_id" { value = aws_instance.bastion.id }
