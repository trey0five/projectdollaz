# ourkyro — Production Infrastructure (Terraform)

FERPA-grade **lean single-AZ** AWS stack for the finrep/ourkyro platform.

## What this provisions

| Concern | Resource |
|---|---|
| Network | VPC, 2-AZ subnets (public / private-app / private-db), **one shared NAT**, IGW, S3 gateway endpoint, security groups |
| Compute | ECS **Fargate** (1 API task, 0.5 vCPU), ECR (scan-on-push), CloudWatch Logs, autoscaling 1→2 |
| Database | RDS **PostgreSQL `db.t4g.micro`**, single-AZ, **SSE-KMS**, **TLS enforced**, 7-day PITR, managed master password |
| Documents | S3 doc bucket (**SSE-KMS**, Block Public Access, **TLS-only**, versioning) + access-log bucket |
| Web (SPA) | Private S3 bucket served via CloudFront (OAC) |
| Edge | Route 53 → CloudFront → ALB, **ACM TLS**, **AWS WAF** (managed rules + rate limit) |
| Secrets | Secrets Manager (app config) + KMS CMKs (rds / s3 / secrets) |
| Email | SES domain identity + DKIM |
| Audit | Free CloudTrail management trail (paid GuardDuty/Config/SecurityHub intentionally omitted for the pilot) |

Estimated run cost: **~$90–100/mo**.

## Manual console prerequisites (one-time, per prod AWS account)

These CANNOT be done in Terraform — they need a human in the AWS/Cloudflare console.

1. **Dedicated prod AWS account** — create one under AWS Organizations (blast-radius isolation), separate from dev/nagare. Run everything below in that account, region **us-east-1**.
2. **Bedrock model access** — Bedrock console → *Model access* → enable **Claude Haiku 4.5** (`anthropic.claude-haiku-4-5-…`) and, if used, **Sonnet 4.5**, submitting the **Anthropic "use case details" form**. Until this is granted, the app's LLM calls fail with *"use case details have not been submitted."* Current Claude models invoke via the cross-region **inference profile** id (`us.anthropic.claude-haiku-4-5-20251001-v1:0`), which is already the default in `variables.tf` and the app config.
3. **SES production access** — SES starts in the sandbox; request production sending.
4. **Cloudflare API token** — create a *Zone → DNS → Edit* token for `ourkyro.com` (passed via `TF_VAR_cloudflare_api_token`).

## Order of operations

```sh
# 1) One-time: create the remote-state bucket + lock table
cd bootstrap && terraform init && terraform apply && cd ..

# 2) Main stack — DNS is managed in Cloudflare (ourkyro.com is a Cloudflare
#    registrar domain, so nameservers stay at Cloudflare). Pass a Cloudflare API
#    token (Zone > DNS > Edit) via env; the Zone ID is already in terraform.tfvars.
cd envs/prod
export TF_VAR_cloudflare_api_token='<your-cloudflare-dns-edit-token>'
terraform init            # uses the S3 backend created in step 1
terraform plan
terraform apply           # creates AWS infra + the Cloudflare DNS records
```

DNS records (ACM validation, apex/www → CloudFront, origin → ALB, SES) are
created automatically in Cloudflare, DNS-only. The ACM cert validates within a
few minutes (Cloudflare is already authoritative — no nameserver switch).

### After the first apply (manual, one-time)
1. **Populate the app secret:** put real values into the `ourkyro-prod-app` secret in Secrets Manager (JWT_SECRET, Stripe, QBO, QBO_TOKEN_KEY, SIS creds). Terraform seeds it with placeholders and then ignores changes.
2. **Push the API image** to the ECR repo (`terraform output ecr_repository_url`) tagged to match `var.api_image_tag`; the Fargate service goes healthy once the image exists.
3. **Restore data** (optional): `terraform apply -var enable_bastion=true`, use `terraform output restore_port_forward_cmd` to tunnel to RDS, `pg_restore`, then `-var enable_bastion=false`.
4. **SES production access:** SES starts in the sandbox — request production sending from the console.
5. **Token-hashing cutover (one-time):** refresh tokens, email-verification tokens, and password-reset codes are now stored **hashed**. If you restored pre-existing (plaintext) rows via pg_dump, flush them so no stale plaintext lingers and everyone re-authenticates cleanly: `DELETE FROM refresh_tokens;` and `UPDATE users SET email_verification_token=NULL, password_reset_code=NULL;`. (Users just log in again; any pending verify/reset emails must be re-requested.)

## ⚠️ Terraform ≠ done
This stands up compliant **infrastructure**. The **application** must still be changed to *use* it (tracked separately): read secrets from Secrets Manager, swap LLM/TTS to Bedrock/Polly + redaction guardrails, set `ServerSideEncryption` on S3 puts + short presign TTL, add `sslmode=require`, access-event/login audit logging, rate limiting + CSPRNG reset codes + hashed tokens, and deletion/retention endpoints.
