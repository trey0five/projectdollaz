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
  // Phase 6 — QuickBooks Online connector (optional). Empty clientId = connector
  // disabled (the Connect button 501s); the app boots and file upload still works.
  quickbooks: {
    clientId: string
    clientSecret: string
    environment: 'sandbox' | 'production'
    redirectUri: string
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
      from: process.env.SMTP_FROM ?? 'finrep <no-reply@finrep.dev>',
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
    quickbooks: {
      clientId: process.env.QB_OAUTH_CLIENT_ID ?? '',
      clientSecret: process.env.QB_OAUTH_CLIENT_SECRET ?? '',
      environment: (process.env.QB_ENVIRONMENT ?? 'sandbox') as 'sandbox' | 'production',
      redirectUri: process.env.QB_REDIRECT_URI ?? `${webOrigin}/integrations/qb/callback`,
    },
  }
}
