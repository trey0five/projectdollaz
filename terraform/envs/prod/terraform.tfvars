project     = "ourkyro"
environment = "prod"
aws_region  = "us-east-1"
domain_name = "ourkyro.com"

# Cloudflare Zone ID for ourkyro.com (not secret). The API token is passed via
# the TF_VAR_cloudflare_api_token env var, NOT here.
cloudflare_zone_id = "dbb7de2b46d2b09c12b32c83079d25b7"

# Lean single-AZ pilot sizing.
db_instance_class = "db.t4g.micro"
api_cpu           = 512
api_memory        = 1024
api_desired_count = 1
api_image_tag     = "latest"
