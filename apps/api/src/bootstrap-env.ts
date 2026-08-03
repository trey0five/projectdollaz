// ─────────────────────────────────────────────────────────────────────────────
// bootstrap-env — runs as the FIRST side-effect import in main.ts, before any
// module (Config / Prisma) reads the environment.
//
// In AWS/ECS the database connection arrives as DISCRETE parts (host/port/name
// come from the task def env; user/password are injected from Secrets Manager).
// Prisma reads a single DATABASE_URL, so we assemble it here and ENFORCE TLS
// (sslmode=require) in production. In local dev a whole DATABASE_URL is supplied,
// so we only ensure sslmode is present when NODE_ENV=production.
//
// Overridable via DATABASE_SSLMODE (e.g. `verify-full` once the RDS CA bundle is
// mounted) and DATABASE_SCHEMA. No TLS is forced in development.
//
// ── AIC Phase I — THE CONNECTION POOL ────────────────────────────────────────
// Prisma's default pool size is `num_cpus * 2 + 1`, which on a 2-vCPU ECS task is
// FIVE. A single bounded org fan-out (four concurrent per-school reads, see
// common/concurrency.ts) plus the request that triggered it already saturates
// that, and the observed failure mode is P2024 — "timed out fetching a new
// connection from the pool" — not a slow response.
//
// WHY THIS FILE AND NOT ONLY start.sh. start.sh assembles DATABASE_URL for the
// `prisma migrate deploy` / `db seed` CLI, and only when the variable is not
// already set. This function then runs as the FIRST side-effect import in main.ts
// and, in AWS mode, OVERWRITES process.env.DATABASE_URL unconditionally. A
// connection_limit added only to start.sh therefore reaches the CLI and is
// discarded before the application ever opens a pool: it would look done and
// change nothing in production. Both sides carry the same two params, read from
// the same two env vars, with the same defaults.
//
// `10 × task count` must stay below the RDS `max_connections`. At two tasks that
// is 20, comfortably inside a t-class default. Do not raise DEFAULT_CONNECTION_LIMIT
// above 10 without an infra review.
// ─────────────────────────────────────────────────────────────────────────────

/** Pool size per application process. Overridable via DATABASE_CONNECTION_LIMIT. */
const DEFAULT_CONNECTION_LIMIT = '10'
/** Seconds a query waits for a free connection before P2024. Overridable via DATABASE_POOL_TIMEOUT. */
const DEFAULT_POOL_TIMEOUT = '20'

/**
 * EXPORTED for the spec only. main.ts still imports this module for its
 * side-effect (the self-invocation at the bottom is unchanged and still runs at
 * import time); exporting the function is what lets bootstrap-env.spec.ts drive
 * BOTH branches with explicit env rather than asserting over source text.
 */
export function assembleDatabaseUrl(): void {
  const {
    DATABASE_HOST,
    DATABASE_PORT,
    DATABASE_NAME,
    DATABASE_USER,
    DATABASE_PASSWORD,
    DATABASE_URL,
    DATABASE_SCHEMA,
    DATABASE_SSLMODE,
    DATABASE_CONNECTION_LIMIT,
    DATABASE_POOL_TIMEOUT,
    NODE_ENV,
  } = process.env

  const sslmode = DATABASE_SSLMODE ?? (NODE_ENV === 'production' ? 'require' : undefined)
  const connectionLimit = DATABASE_CONNECTION_LIMIT ?? DEFAULT_CONNECTION_LIMIT
  const poolTimeout = DATABASE_POOL_TIMEOUT ?? DEFAULT_POOL_TIMEOUT

  // AWS mode: build the URL from the injected parts.
  if (DATABASE_HOST && DATABASE_USER && DATABASE_PASSWORD) {
    const params = new URLSearchParams({ schema: DATABASE_SCHEMA ?? 'public' })
    if (sslmode) params.set('sslmode', sslmode)
    params.set('connection_limit', connectionLimit)
    params.set('pool_timeout', poolTimeout)
    const user = encodeURIComponent(DATABASE_USER)
    const pass = encodeURIComponent(DATABASE_PASSWORD)
    const port = DATABASE_PORT ?? '5432'
    const name = DATABASE_NAME ?? 'finrep'
    process.env.DATABASE_URL = `postgresql://${user}:${pass}@${DATABASE_HOST}:${port}/${name}?${params.toString()}`
    return
  }

  // A full URL was provided (local dev / docker-compose). Only ADD what is missing;
  // never rewrite a value the URL already states. A dev/docker URL that sets its own
  // connection_limit must win — the same rule the sslmode guard has always used.
  if (DATABASE_URL) {
    let url = DATABASE_URL
    const append = (key: string, value: string) => {
      if (new RegExp(`[?&]${key}=`, 'i').test(url)) return
      url += `${url.includes('?') ? '&' : '?'}${key}=${value}`
    }
    if (sslmode) append('sslmode', sslmode)
    append('connection_limit', connectionLimit)
    append('pool_timeout', poolTimeout)
    if (url !== DATABASE_URL) process.env.DATABASE_URL = url
  }
}

assembleDatabaseUrl()
