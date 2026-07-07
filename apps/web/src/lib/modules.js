// ─────────────────────────────────────────────────────────────────────────────
// modules.js — WEB MIRROR of the @finrep/db/modules entitlement registry.
//
// apps/web does not depend on @finrep/db at runtime (that package re-exports the
// Prisma client, which we deliberately keep out of the Vite bundle). This is a
// hand-kept mirror of packages/db/src/modules.ts — keep the two in sync. The
// canonical definition lives in packages/db/src/modules.ts.
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
  'strategy',
]

/** The always-on module. Never gated, never sold. */
export const CORE_MODULE = 'core'

/** The legacy/default module a null/legacy subscription resolves to. */
export const DEFAULT_MODULE = 'finance'

export const MODULE_META = {
  core: { key: 'core', label: 'Core', description: 'Sign-in, schools, users, settings, billing — always included.', core: true },
  finance: { key: 'finance', label: 'Finance', description: 'Statements, imports, analytics, budget, board report, compliance, QBO.', core: false },
  planning: { key: 'planning', label: 'Planning & Forecasting', description: 'Multi-year forecast, enrollment/tuition drivers, scenarios.', core: false },
  governance: { key: 'governance', label: 'Governance', description: 'Board packets, policies, committee reporting, minutes.', core: false },
  enrollment: { key: 'enrollment', label: 'Enrollment', description: 'Admissions & enrollment funnel, retention, feeder grades.', core: false },
  hr: { key: 'hr', label: 'HR & Staffing', description: 'FTE planning, compensation, staffing plans.', core: false },
  facilities: { key: 'facilities', label: 'Facilities', description: 'Capital projects & deferred maintenance.', core: false },
  advancement: { key: 'advancement', label: 'Advancement', description: 'Development, campaigns, giving, gift schedules.', core: false },
  accreditation: { key: 'accreditation', label: 'Accreditation', description: 'Compliance & accreditation readiness, self-study, evidence.', core: false },
  strategy: { key: 'strategy', label: 'Strategic Planning', description: 'Strategic plans, pillars, goals & initiatives — self-measuring against your live financials.', core: false },
}

/** The sellable (non-core) module keys. */
export const SELLABLE_MODULE_KEYS = MODULE_KEYS.filter((k) => k !== CORE_MODULE)

/** Is `v` a known module key? */
export function isModuleKey(v) {
  return typeof v === 'string' && MODULE_KEYS.includes(v)
}
