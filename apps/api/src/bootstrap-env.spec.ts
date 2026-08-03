import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assembleDatabaseUrl } from './bootstrap-env.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase I — acceptance 9: `connection_limit` reaches the APPLICATION POOL,
// not only the migrate CLI.
//
// The trap this spec exists for: start.sh assembles DATABASE_URL only when it is
// not already set, and this module then OVERWRITES it unconditionally in AWS mode.
// Adding the parameter to start.sh alone would look done and change nothing in
// production, because the running app never sees that string. Both branches are
// driven here with explicit env — no source-text matching, no clock, no I/O.
//
// RED PROOF (run): deleting `params.set('connection_limit', …)` from the AWS
// branch reddens "AWS mode carries connection_limit"; deleting the append in the
// full-URL branch reddens "a dev URL gains the pool params".
// ─────────────────────────────────────────────────────────────────────────────

const KEYS = [
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'DATABASE_URL',
  'DATABASE_SCHEMA',
  'DATABASE_SSLMODE',
  'DATABASE_CONNECTION_LIMIT',
  'DATABASE_POOL_TIMEOUT',
  'NODE_ENV',
] as const

let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
})

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k] as string
  }
})

function url(): URL {
  return new URL(process.env.DATABASE_URL as string)
}

describe('bootstrap-env — AWS mode (the branch that actually runs in production)', () => {
  beforeEach(() => {
    process.env.DATABASE_HOST = 'db.internal'
    process.env.DATABASE_USER = 'app'
    process.env.DATABASE_PASSWORD = 'p@ss word/1'
    process.env.DATABASE_NAME = 'finrep'
    process.env.NODE_ENV = 'production'
  })

  it('carries connection_limit and pool_timeout at the frozen defaults', () => {
    assembleDatabaseUrl()
    expect(url().searchParams.get('connection_limit')).toBe('10')
    expect(url().searchParams.get('pool_timeout')).toBe('20')
  })

  it('still enforces sslmode and schema — nothing regressed', () => {
    assembleDatabaseUrl()
    expect(url().searchParams.get('sslmode')).toBe('require')
    expect(url().searchParams.get('schema')).toBe('public')
    expect(url().hostname).toBe('db.internal')
  })

  it('honours DATABASE_CONNECTION_LIMIT / DATABASE_POOL_TIMEOUT overrides', () => {
    process.env.DATABASE_CONNECTION_LIMIT = '6'
    process.env.DATABASE_POOL_TIMEOUT = '15'
    assembleDatabaseUrl()
    expect(url().searchParams.get('connection_limit')).toBe('6')
    expect(url().searchParams.get('pool_timeout')).toBe('15')
  })

  it('OVERWRITES a pre-set DATABASE_URL — which is exactly why start.sh alone is not enough', () => {
    process.env.DATABASE_URL = 'postgresql://someone@elsewhere:5432/other?connection_limit=99'
    assembleDatabaseUrl()
    expect(url().hostname).toBe('db.internal')
    expect(url().searchParams.get('connection_limit')).toBe('10')
  })
})

describe('bootstrap-env — full-URL mode (local dev / docker-compose)', () => {
  it('a dev URL gains the pool params', () => {
    process.env.DATABASE_URL = 'postgresql://dev:dev@localhost:5434/finrep?schema=public'
    assembleDatabaseUrl()
    expect(url().searchParams.get('connection_limit')).toBe('10')
    expect(url().searchParams.get('pool_timeout')).toBe('20')
  })

  it('a URL with NO query string still gets them, with a `?` not an `&`', () => {
    process.env.DATABASE_URL = 'postgresql://dev:dev@localhost:5434/finrep'
    assembleDatabaseUrl()
    expect(process.env.DATABASE_URL).toContain('?connection_limit=10')
    expect(url().searchParams.get('pool_timeout')).toBe('20')
  })

  it('a URL that already states connection_limit WINS — we never rewrite it', () => {
    process.env.DATABASE_URL = 'postgresql://dev:dev@localhost:5434/finrep?connection_limit=3'
    assembleDatabaseUrl()
    expect(url().searchParams.getAll('connection_limit')).toEqual(['3'])
  })

  it('does not force sslmode outside production — the shipped rule is unchanged', () => {
    process.env.DATABASE_URL = 'postgresql://dev:dev@localhost:5434/finrep'
    assembleDatabaseUrl()
    expect(url().searchParams.get('sslmode')).toBeNull()
  })

  it('with no DATABASE_URL and no host, nothing is invented', () => {
    assembleDatabaseUrl()
    expect(process.env.DATABASE_URL).toBeUndefined()
  })
})

describe('start.sh and bootstrap-env agree', () => {
  it('start.sh emits the same two params from the same two env vars', () => {
    // The CLI half. `prisma migrate deploy` runs before the app exists, so it
    // needs its own URL — and if the two halves disagree the comment in start.sh
    // ("bootstrap-env re-derives the same value") stops being true.
    const sh = readFileSync(fileURLToPath(new URL('../start.sh', import.meta.url)), 'utf8')
    expect(sh).toContain('DATABASE_CONNECTION_LIMIT')
    expect(sh).toContain('DATABASE_POOL_TIMEOUT')
    expect(sh).toContain('connection_limit=')
    expect(sh).toContain('pool_timeout=')
  })
})
