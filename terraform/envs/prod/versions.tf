terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws        = { source = "hashicorp/aws", version = "~> 5.60" }
    random     = { source = "hashicorp/random", version = "~> 3.6" }
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 4.40" }
  }

  # State backend created by ../../bootstrap. Run bootstrap first.
  backend "s3" {
    bucket         = "ourkyro-prod-tfstate"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "ourkyro-prod-tflock"
    encrypt        = true
  }
}

# CloudFront, its ACM cert, and CLOUDFRONT-scoped WAF must live in us-east-1.
# Keeping the whole stack here avoids a second provider alias for the pilot.
provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# DNS stays at Cloudflare (ourkyro.com is a Cloudflare-registrar domain, so its
# nameservers can't move to Route 53). This provider manages the records.
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
