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
// ─────────────────────────────────────────────────────────────────────────────

function assembleDatabaseUrl(): void {
  const {
    DATABASE_HOST,
    DATABASE_PORT,
    DATABASE_NAME,
    DATABASE_USER,
    DATABASE_PASSWORD,
    DATABASE_URL,
    DATABASE_SCHEMA,
    DATABASE_SSLMODE,
    NODE_ENV,
  } = process.env

  const sslmode = DATABASE_SSLMODE ?? (NODE_ENV === 'production' ? 'require' : undefined)

  // AWS mode: build the URL from the injected parts.
  if (DATABASE_HOST && DATABASE_USER && DATABASE_PASSWORD) {
    const params = new URLSearchParams({ schema: DATABASE_SCHEMA ?? 'public' })
    if (sslmode) params.set('sslmode', sslmode)
    const user = encodeURIComponent(DATABASE_USER)
    const pass = encodeURIComponent(DATABASE_PASSWORD)
    const port = DATABASE_PORT ?? '5432'
    const name = DATABASE_NAME ?? 'finrep'
    process.env.DATABASE_URL = `postgresql://${user}:${pass}@${DATABASE_HOST}:${port}/${name}?${params.toString()}`
    return
  }

  // A full URL was provided (local dev / docker-compose). Only ensure sslmode in
  // production; never rewrite a dev URL.
  if (DATABASE_URL && sslmode && !/[?&]sslmode=/i.test(DATABASE_URL)) {
    const sep = DATABASE_URL.includes('?') ? '&' : '?'
    process.env.DATABASE_URL = `${DATABASE_URL}${sep}sslmode=${sslmode}`
  }
}

assembleDatabaseUrl()
