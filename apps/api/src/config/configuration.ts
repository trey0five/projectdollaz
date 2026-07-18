// ─────────────────────────────────────────────────────────────────────────────
// Typed env factory. Loaded by ConfigModule.forRoot({ load: [configuration] }).
// DATABASE_URL is required; everything else has a default or is a placeholder
// reserved for later sub-phases (JWT -> 1B, Stripe -> 1D).
// ─────────────────────────────────────────────────────────────────────────────
import { randomBytes } from 'node:crypto'
import { SELLABLE_MODULE_KEYS } from '@finrep/db'

export interface AppConfig {
  port: number
  webOrigin: string
  database: {
    url: string
  }
  nodeEnv: string
  jwt: {
    secret: string
    accessTtl: string
    refreshTtl: string
  }
  smtp: {
    host: string
    port: number
    user: string
    pass: string
    from: string
  }
  // Outbound mail. provider: 'ses' (AWS SDK via the ECS task role — no static
  // creds), 'smtp' (nodemailer), or '' (dev: log to console). `from` and region
  // are shared; SES uses the verified `ourkyro.com` domain identity.
  mail: {
    provider: string
    region: string
    from: string
  }
  // Phase 1D — Stripe subscription billing. All env-driven with safe empty
  // defaults so the api BOOTS with no Stripe key set (checkout/portal then
  // return a clear error; the webhook still verifies if a webhookSecret exists).
  stripe: {
    secretKey: string
    webhookSecret: string
    priceMonthly: string
    priceYearly: string
    // Per-module Stripe billing (v1 monthly-only). `priceCore` is the base/core
    // line item for a modular subscription; `modulePrices` maps a SELLABLE module
    // key → its Stripe priceId. All env-driven with empty defaults so the api
    // BOOTS keyless. An empty priceId means "not purchasable via checkout" and is
    // simply skipped by the price map (reconciliation still recognizes prices we
    // DO map). Config-driven: adding a sellable module needs only a new env var.
    priceCore: string
    modulePrices: Record<string, string>
    trialDays: number
    successUrl: string
    cancelUrl: string
    portalReturnUrl: string
  }
  // Phase 4D — optional Claude upgrade for the AI insight summary. Empty by
  // default so the api BOOTS with no key and insights fall back to the pure
  // deterministic rule-based summary (never throws when unset).
  anthropic: {
    apiKey: string
    model: string
  }
  // Alternative LLM provider for the insight upgrade: OpenRouter (OpenAI-compatible,
  // routes to Claude). Preferred over the native Anthropic path when its key is set.
  openrouter: {
    apiKey: string
    model: string
    baseUrl: string
  }
  // Penny voice replies (text-to-speech) via ElevenLabs. Empty apiKey => the TTS
  // proxy returns 503 and the frontend falls back to the browser SpeechSynthesis
  // API, so voice works out-of-the-box and upgrades automatically if a key is set.
  elevenlabs: {
    apiKey: string
    voiceId: string
    model: string
  }
  // Amazon Polly — the in-account TTS used when the assistant provider is
  // 'bedrock' (task-role creds; replaces ElevenLabs as an external sub-processor).
  polly: {
    region: string
    voiceId: string
    engine: string
  }
  // Phase 6 — QuickBooks Online connector (optional). Empty clientId = connector
  // disabled (the Connect button 501s); the app boots and file upload still works.
  quickbooks: {
    clientId: string
    clientSecret: string
    environment: 'sandbox' | 'production'
    redirectUri: string
    /** Global kill-switch for the nightly auto-sync sweep (default ON). */
    autoSyncEnabled: boolean
    /** Server-local overnight hour range 'startHour-endHour' (default '2-5'). */
    autoSyncWindow: string
  }
  // Phase 2 Enrollment Intelligence — SIS/roster connectors (optional, per provider).
  // Empty keys => that provider is DARK (its adapter.isConfigured() is false): the
  // Connect/key form is hidden and sync 400s, while the universal OneRoster CSV/ZIP
  // upload path always works. Blackbaud is the one open dev sandbox (OAuth2 + a
  // subscription-key header); FACTS/Veracross/OneRoster-REST are customer-gated and
  // ship built-to-spec but disabled until their env keys are set. Mirrors `quickbooks`.
  enrollment: {
    blackbaud: {
      clientId: string
      clientSecret: string
      redirectUri: string
      subscriptionKey: string
      studentRoleId: string
      environment: 'sandbox' | 'production'
    }
    oneroster: {
      clientId: string
      clientSecret: string
      baseUrl: string
    }
    facts: {
      clientId: string
      apiKey: string
      baseUrl: string
    }
    veracross: {
      clientId: string
      clientSecret: string
      baseUrl: string
    }
  }
  // Phase 4 Knowledge document store — AWS S3 object storage for uploaded files.
  // Empty bucket/creds => DocumentStorageService.isConfigured() is false, so the
  // upload/download endpoints return 503 while the app still BOOTS keyless and the
  // list endpoint still works. Creds are read ONLY here (from env) — never hardcoded,
  // never logged, never returned in a response.
  s3Documents: {
    region: string
    bucket: string
    prefix: string
    accessKeyId: string
    secretAccessKey: string
    urlTtlSeconds: number
    // Server-side encryption enforced on every upload. Default 'aws:kms' (the
    // bucket policy DENIES un-encrypted puts); set 'none' only for a dev bucket
    // that has no KMS default. sseKmsKeyId is optional — empty uses the bucket's
    // default CMK.
    serverSideEncryption: string
    sseKmsKeyId: string
  }
  // Data-retention purge (RetentionService). auditDays=0 keeps audit rows forever
  // (the default); >0 trims audit_log older than N days.
  retention: {
    auditDays: number
  }
  // FERPA guardrails + LLM provider for the Penny assistant. `ferpaMode` (default
  // ON) enables PII tokenization + denies whole PDF/image egress to the model.
  // `provider` selects the LLM transport: 'bedrock' (in-account, the compliant
  // path — auto-selected when BEDROCK_MODEL_ID is present) or 'openrouter' (dev).
  assistant: {
    ferpaMode: boolean
    provider: string
    bedrock: {
      region: string
      modelId: string
    }
  }
}

const DEFAULT_DEV_SECRET = 'changeme-dev-only'

/**
 * Resolve the JWT signing secret. Fails fast in production if the secret is
 * unset, still the well-known dev default, or too short to be safe. In dev we
 * fall back to a random per-process secret (NOT the well-known constant) so a
 * forgotten JWT_SECRET cannot be forged with a publicly-known value.
 */
function resolveJwtSecret(nodeEnv: string): string {
  const provided = process.env.JWT_SECRET
  const isProd = nodeEnv === 'production'

  if (isProd) {
    if (!provided || provided === DEFAULT_DEV_SECRET || provided.length < 32) {
      throw new Error(
        'JWT_SECRET must be set to a strong value (>= 32 chars, not the dev default) in production.',
      )
    }
    return provided
  }

  if (provided && provided.length > 0) return provided
  // Dev with no JWT_SECRET: generate an ephemeral random secret for this process
  // so tokens are never forgeable with a known constant. Tokens won't survive a
  // restart, which is acceptable for local dev.
  return randomBytes(48).toString('hex')
}

export function configuration(): AppConfig {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is required but was not provided')
  }

  const nodeEnv = process.env.NODE_ENV ?? 'development'
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173'

  // Build the sellable module → priceId map from STRIPE_PRICE_<MODULE> env vars.
  // Empty/unset values are omitted so an unconfigured module is truly absent (its
  // toggle disables in the FE; reconciliation never mis-recognizes an '' price).
  const modulePrices: Record<string, string> = {}
  for (const key of SELLABLE_MODULE_KEYS) {
    const envVal = process.env[`STRIPE_PRICE_${key.toUpperCase()}`]
    if (envVal) modulePrices[key] = envVal
  }

  return {
    port: parseInt(process.env.PORT ?? '8000', 10),
    webOrigin,
    database: { url },
    nodeEnv,
    jwt: {
      secret: resolveJwtSecret(nodeEnv),
      accessTtl: process.env.JWT_ACCESS_TTL ?? '900s',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
    },
    smtp: {
      host: process.env.SMTP_HOST ?? '',
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
      from: process.env.SMTP_FROM ?? 'KYRO <noreply@ourkyro.com>',
    },
    mail: {
      // '' (dev) unless set. In prod set MAIL_PROVIDER=ses. Falls back to 'smtp'
      // automatically when SMTP_HOST is present but MAIL_PROVIDER is unset.
      provider: (process.env.MAIL_PROVIDER ?? (process.env.SMTP_HOST ? 'smtp' : '')).toLowerCase(),
      region: process.env.AWS_REGION ?? 'us-east-1',
      from: process.env.MAIL_FROM ?? process.env.SMTP_FROM ?? 'KYRO <noreply@ourkyro.com>',
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY ?? '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
      priceMonthly: process.env.STRIPE_PRICE_MONTHLY ?? '',
      priceYearly: process.env.STRIPE_PRICE_YEARLY ?? '',
      priceCore: process.env.STRIPE_PRICE_CORE ?? '',
      modulePrices,
      trialDays: parseInt(process.env.STRIPE_TRIAL_DAYS ?? '14', 10),
      successUrl:
        process.env.STRIPE_SUCCESS_URL ?? `${webOrigin}/settings/billing?checkout=success`,
      cancelUrl:
        process.env.STRIPE_CANCEL_URL ?? `${webOrigin}/settings/billing?checkout=cancel`,
      portalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL ?? `${webOrigin}/settings/billing`,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5',
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-haiku-4.5',
      baseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    },
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY ?? '',
      voiceId: process.env.ELEVENLABS_VOICE_ID ?? 'cgSgspJ2msm6clMCkdW9',
      model: process.env.ELEVENLABS_MODEL ?? 'eleven_turbo_v2_5',
    },
    polly: {
      region: process.env.AWS_REGION ?? 'us-east-1',
      voiceId: process.env.POLLY_VOICE_ID ?? 'Joanna',
      engine: process.env.POLLY_ENGINE ?? 'neural',
    },
    quickbooks: {
      clientId: process.env.QB_OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.QB_OAUTH_CLIENT_SECRET ?? '',
      environment: (process.env.QB_ENVIRONMENT ?? 'sandbox') as 'sandbox' | 'production',
      redirectUri: process.env.QB_REDIRECT_URI ?? `${webOrigin}/integrations/qb/callback`,
      // Nightly auto-sync. Default ON; only an explicit 'false' disables the sweep.
      autoSyncEnabled: (process.env.QBO_AUTOSYNC_ENABLED ?? 'true') !== 'false',
      autoSyncWindow: process.env.QBO_AUTOSYNC_WINDOW ?? '2-5',
    },
    // Phase 2 Enrollment Intelligence — SIS connectors. All env-driven with empty
    // defaults so the api BOOTS keyless (every provider dark; CSV upload still works).
    enrollment: {
      blackbaud: {
        clientId: process.env.BLACKBAUD_OAUTH_CLIENT_ID ?? '',
        clientSecret: process.env.BLACKBAUD_OAUTH_CLIENT_SECRET ?? '',
        redirectUri: process.env.BLACKBAUD_REDIRECT_URI ?? `${webOrigin}/enrollment/blackbaud/callback`,
        subscriptionKey: process.env.BLACKBAUD_SUBSCRIPTION_KEY ?? '',
        studentRoleId: process.env.BLACKBAUD_STUDENT_ROLE_ID ?? '',
        environment: (process.env.BLACKBAUD_ENVIRONMENT ?? 'sandbox') as 'sandbox' | 'production',
      },
      oneroster: {
        clientId: process.env.ONEROSTER_OAUTH_CLIENT_ID ?? '',
        clientSecret: process.env.ONEROSTER_OAUTH_CLIENT_SECRET ?? '',
        baseUrl: process.env.ONEROSTER_BASE_URL ?? '',
      },
      facts: {
        clientId: process.env.FACTS_CLIENT_ID ?? '',
        apiKey: process.env.FACTS_SUBSCRIPTION_KEY ?? '',
        baseUrl: process.env.FACTS_BASE_URL ?? '',
      },
      veracross: {
        clientId: process.env.VERACROSS_CLIENT_ID ?? '',
        clientSecret: process.env.VERACROSS_CLIENT_SECRET ?? '',
        baseUrl: process.env.VERACROSS_BASE_URL ?? '',
      },
    },
    // Safe empty defaults so the api BOOTS with no S3 creds (upload/download then
    // 503; list still works). region/prefix have benign defaults and are NOT part of
    // the readiness test (isConfigured checks bucket + accessKeyId + secretAccessKey).
    s3Documents: {
      region: process.env.AWS_REGION ?? 'us-east-1',
      bucket: process.env.S3_DOCUMENTS_BUCKET ?? '',
      prefix: process.env.S3_DOCUMENTS_PREFIX ?? 'finrep/documents',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      // Default 15 minutes — a presigned URL is a bearer capability, so it must be
      // short-lived (was 7 days). Overridable, but keep it tight for PII documents.
      urlTtlSeconds: parseInt(process.env.S3_DOCUMENTS_URL_TTL ?? '900', 10),
      serverSideEncryption: process.env.S3_DOCUMENTS_SSE ?? 'aws:kms',
      sseKmsKeyId: process.env.S3_DOCUMENTS_SSE_KMS_KEY_ID ?? '',
    },
    retention: {
      auditDays: parseInt(process.env.AUDIT_RETENTION_DAYS ?? '0', 10),
    },
    assistant: {
      // FERPA mode ON by default; only an explicit 'false' disables the guardrails.
      ferpaMode: (process.env.FERPA_MODE ?? 'true') !== 'false',
      // Prefer Bedrock automatically wherever a model id is injected (AWS); local
      // dev with no Bedrock falls back to OpenRouter.
      provider:
        process.env.ASSISTANT_LLM_PROVIDER ??
        (process.env.BEDROCK_MODEL_ID ? 'bedrock' : 'openrouter'),
      bedrock: {
        region: process.env.AWS_REGION ?? 'us-east-1',
        // Cross-region INFERENCE PROFILE id (the `us.` form) — current Claude
        // models require an inference profile for on-demand Converse, not the
        // bare model id.
        modelId:
          process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      },
    },
  }
}
