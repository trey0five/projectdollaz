# Shared-account isolation — Village Finders + ourkyro (account `785878451144`)

Running two projects (VF = HIPAA health docs · ourkyro = FERPA education data) in one
AWS account. This is the plan to isolate them so neither project's identity can read
the other's data.

> **Honest ceiling:** IAM/KMS scoping isolates *non-admin* identities. Account
> **admins and root always bypass** everything, and a shared account can't use SCPs.
> A dedicated account (free) is the only hard boundary. This gets you strong,
> defensible isolation short of that.

## Current state (why "scope the VF key" isn't enough)
- **VF uses only S3** (buckets `villagefinder*-docs` + an S3 env-config bucket). No
  RDS/Lambda/DynamoDB/SES/KMS-in-code; its DB is self-hosted Postgres in Docker.
- **VF and ourkyro share ONE IAM key** — both `.env`s use `AKIA3N6QBQ…` (user
  `tmunroe`). So you can't restrict "the VF key" without breaking ourkyro. The fix is
  to **split** the shared key into scoped identities.

## Target identities
| Identity | Scope | Used by |
|---|---|---|
| **`village-finder-app`** (new IAM user) | `vf-scoped-policy.json` — S3 on `villagefinder*-docs` + env bucket; explicit Deny on `ourkyro-prod-*` | VF app `.env` |
| **ourkyro task role** (Terraform builds it) | `ourkyro-prod-*` S3/secrets/KMS + Bedrock only | ourkyro app on ECS — **no static key** |
| **`tmunroe`** (or a dedicated deploy user) | broad, for `terraform apply` only — not embedded in any app | you, at deploy time |

## What Terraform already enforces (ourkyro side)
- The ECS **task role** is limited to `ourkyro-prod-*` resources + Bedrock — it can't
  touch VF buckets.
- **KMS key isolation** (`enable_kms_isolation = true`, default): the ourkyro CMK
  policies **DENY direct `kms:Decrypt`/`Encrypt`** to any principal that isn't an
  ourkyro role, the account root, or a listed admin — *including* the shared
  `tmunroe` user. RDS/S3/SecretsManager integrations still work (they're exempt via
  `kms:ViaService` / AWS-service principal). So a broad shared-account user can't
  raw-decrypt ourkyro data. (Set `enable_kms_isolation = false` only if a first
  apply hits a KMS error; add a break-glass ARN via `kms_admin_principal_arns`.)

## Runbook — split the shared key (do this WITHOUT breaking VF)
1. **Fill the placeholder:** in `vf-scoped-policy.json`, replace
   `REPLACE_WITH_VF_ENV_BUCKET` with VF's real `S3_ENV_BUCKET` name.
2. **Create the scoped VF identity:**
   - IAM → Users → **Create user** `village-finder-app` (no console access).
   - Attach an inline/managed policy from `vf-scoped-policy.json`.
   - Create an **access key** for it.
3. **Cut VF over to the new key (test before locking in):**
   - Put the new key in VF's `.env` (and any Docker/EC2 secret store VF reads).
   - Restart VF and **verify**: upload + download a provider/client/physician doc,
     and the S3 env bootstrap. Confirm no `AccessDenied`.
4. **Only after VF is confirmed working on the new key**, stop using the shared
   `tmunroe` key in VF and **rotate `tmunroe`'s access key** (it was exposed in
   both `.env`s). Keep `tmunroe` as your **deploy/admin** identity only.
5. **ourkyro app needs no static key** — on ECS it uses the Terraform task role. (For
   local ourkyro dev you can keep a scoped key or reuse `tmunroe`.)

## Residual risks (the part a dedicated account would close)
- **Admin/root** (`tmunroe`, root) can still reach either project's data via the
  services (e.g. `s3:GetObject`, `secretsmanager:GetSecretValue` are service-mediated,
  not blocked by the KMS direct-use Deny). Treat those credentials as high-value.
- **Two compliance regimes (HIPAA + FERPA) in one account** is a real auditor flag.
- No **SCP** boundary (single account).
