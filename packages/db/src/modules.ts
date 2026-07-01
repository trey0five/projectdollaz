// ─────────────────────────────────────────────────────────────────────────────
// @finrep/db/modules — PER-MODULE ENTITLEMENT REGISTRY (pure const, no Prisma).
//
// The single source of truth for the platform's licensable modules. This file
// deliberately imports NOTHING from @prisma/client (or anything else) so it is a
// zero-dependency TS const that both apps/api (via the @finrep/db barrel) and any
// bundler can consume without pulling the Prisma client into a client build.
//
// A school's subscription carries a SET of licensed modules; each guarded feature
// declares which module it needs. `core` is ALWAYS-ON, NEVER gated, and can never
// be unbundled. `finance` is the legacy/default module: an existing active
// subscription with a null/legacy module set resolves to {finance} (+core), so
// every route that passes today keeps passing.
//
// NOTE: apps/web mirrors MODULE_KEYS/MODULE_META in apps/web/src/lib/modules.js —
// web does not (today) depend on @finrep/db at runtime, and we keep it that way to
// avoid dragging @prisma/client into the Vite bundle. Keep the two in sync; this
// file is the canonical definition.
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical ordered list of module keys. `core` is always-on. */
export const MODULE_KEYS = [
  'core',
  'finance',
  'planning',
  'governance',
  'enrollment',
  'hr',
  'facilities',
  'advancement',
  'accreditation',
] as const

export type ModuleKey = (typeof MODULE_KEYS)[number]

/** The always-on module. Never stored in a licensed set, never gated, never sold. */
export const CORE_MODULE = 'core' as const

/** The legacy/default module a null/legacy subscription resolves to. */
export const DEFAULT_MODULE = 'finance' as const

/** Optional per-module tier (informational this slice; never gates access). */
export type ModuleTier = 'standard' | 'plus' | 'enterprise'

/** The stored/returned shape of one licensed module. `tier` is optional. */
export interface LicensedModule {
  key: ModuleKey
  tier?: ModuleTier | null
}

export interface ModuleDef {
  key: ModuleKey
  label: string
  description: string
  /** true only for `core` — always-on, cannot be unbundled or sold. */
  core: boolean
}

export const MODULE_META: Record<ModuleKey, ModuleDef> = {
  core: {
    key: 'core',
    label: 'Core',
    description: 'Sign-in, schools, users, settings, billing — always included.',
    core: true,
  },
  finance: {
    key: 'finance',
    label: 'Finance',
    description: 'Statements, imports, analytics, budget, board report, compliance, QBO.',
    core: false,
  },
  planning: {
    key: 'planning',
    label: 'Planning & Forecasting',
    description: 'Multi-year forecast, enrollment/tuition drivers, scenarios.',
    core: false,
  },
  governance: {
    key: 'governance',
    label: 'Governance',
    description: 'Board packets, policies, committee reporting, minutes.',
    core: false,
  },
  enrollment: {
    key: 'enrollment',
    label: 'Enrollment',
    description: 'Admissions & enrollment funnel, retention, feeder grades.',
    core: false,
  },
  hr: {
    key: 'hr',
    label: 'HR & Staffing',
    description: 'FTE planning, compensation, staffing plans.',
    core: false,
  },
  facilities: {
    key: 'facilities',
    label: 'Facilities',
    description: 'Capital projects & deferred maintenance.',
    core: false,
  },
  advancement: {
    key: 'advancement',
    label: 'Advancement',
    description: 'Development, campaigns, giving, gift schedules.',
    core: false,
  },
  accreditation: {
    key: 'accreditation',
    label: 'Accreditation',
    description: 'Compliance & accreditation readiness, self-study, evidence.',
    core: false,
  },
}

/** Type guard: is `v` a known module key? */
export function isModuleKey(v: unknown): v is ModuleKey {
  return typeof v === 'string' && (MODULE_KEYS as readonly string[]).includes(v)
}

/** True only for the always-on `core` module. */
export function isCoreModule(key: string): boolean {
  return key === CORE_MODULE
}

/** The sellable (non-core) module keys — used to surface trial all-access. */
export const SELLABLE_MODULE_KEYS: ModuleKey[] = MODULE_KEYS.filter(
  (k) => k !== CORE_MODULE,
)

/** Legacy/null resolution target: an array of the default module(s). */
export const DEFAULT_LICENSED_MODULES: LicensedModule[] = [{ key: DEFAULT_MODULE, tier: null }]
