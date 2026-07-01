// ─────────────────────────────────────────────────────────────────────────────
// MODULE-SCOPED METRIC GATING.
//
// A metric is included at a surface ONLY when the school (or, at org scope, the
// org) is entitled to the MODULE that owns the metric's DOMAIN. This is the
// mechanism that makes a page-less sellable module (e.g. HR) light up exactly its
// metrics: licensing hr shows student_teacher_ratio; a school without hr does not.
//
// LIVES IN apps/api ON PURPOSE: the pure @finrep/analytics package is entitlement-
// agnostic by contract (compute/org-compute are consumed by tests and stay pure).
// The domain→module map + the billing filter are the ONLY entitlement-aware pieces,
// so they live here — the package never imports billing.
//
// NO-LOCKOUT / NO-REGRESSION (CRITICAL):
//   • finance/operations/aid ALL map to the 'finance' module, which every ENTITLED
//     school licenses (a legacy/null set resolves to [{finance}]) — so those 11
//     metrics are STRUCTURALLY never gated: 'finance' is seeded true and its
//     membership is NOT resolved through a fragile billing call. A billing throw
//     can therefore NEVER drop a finance metric.
//   • ONLY enrollment (→'enrollment') and hr (→'hr') are conditionally gated, each
//     resolved with .catch(()=>false) → FAIL-CLOSED (a billing hiccup hides ONLY an
//     enrollment/hr metric).
//   • TRIAL = all-access (isEntitledForModule returns true for every module while
//     trialing) → every metric shows; no gating effect during a trial.
//   • DOCUMENTED BEHAVIOR CHANGE: an active finance-only school STOPS seeing
//     enrollment_change_yoy and never sees student_teacher_ratio — correct per the
//     module model (you licensed finance, not enrollment/hr).
//
// The SAME helper is reused at all 3 surfaces (per-school /metrics, briefing STEP 1,
// org-metrics) so a metric hidden from one is provably absent from the others.
// ─────────────────────────────────────────────────────────────────────────────
import type { ModuleKey } from '@finrep/db'
import { type MetricDomain, type MetricResult, METRIC_META } from '@finrep/analytics'

/** The always-present module every entitled school has (finance-family bypass). */
const FINANCE_MODULE: ModuleKey = 'finance'

/**
 * DOMAIN → MODULE. Exhaustive over MetricDomain (a `Record<MetricDomain, ...>` so a
 * future domain forces an explicit entry rather than silently defaulting). The three
 * finance-family domains all map to 'finance' (never gated); enrollment/hr are the
 * only conditionally-gated modules.
 */
export const DOMAIN_TO_MODULE: Record<MetricDomain, ModuleKey> = {
  finance: 'finance',
  operations: 'finance',
  aid: 'finance',
  enrollment: 'enrollment',
  hr: 'hr',
}

/**
 * The module that owns a domain. An ABSENT/unknown domain defaults to 'finance'
 * (fail-OPEN toward the always-present module) so a metric that forgot to declare a
 * domain is never accidentally hidden.
 */
export function moduleForDomain(domain: MetricDomain | undefined): ModuleKey {
  return domain ? DOMAIN_TO_MODULE[domain] : FINANCE_MODULE
}

/** metricKey → owning module, resolved from the registry's static domain metadata. */
const MODULE_BY_METRIC_KEY: Record<string, ModuleKey> = Object.fromEntries(
  METRIC_META.map((m) => [m.key, moduleForDomain(m.domain)]),
)

/** The module that owns a metric key (defaults to 'finance' for any unknown key). */
export function moduleForMetricKey(key: string): ModuleKey {
  return MODULE_BY_METRIC_KEY[key] ?? FINANCE_MODULE
}

/**
 * Minimal billing surface this gate needs (structurally typed so tests can hand-mock
 * without booting Nest). Only isEntitledForModule is used.
 */
export interface EntitlementResolver {
  isEntitledForModule(schoolId: string, moduleKey: string): Promise<boolean>
}

/**
 * The set of modules a school is entitled to that are REACHABLE by metric gating.
 * 'finance' is seeded true UNCONDITIONALLY (never behind a fragile billing call —
 * these surfaces already run behind the entitlement guard / getOwnedPeriod, so the
 * school is entitled and licenses finance). Only 'enrollment' and 'hr' are resolved
 * via isEntitledForModule, each FAIL-CLOSED (.catch(()=>false)).
 */
export async function entitledModulesForSchool(
  schoolId: string,
  billing: EntitlementResolver,
): Promise<Set<ModuleKey>> {
  const set = new Set<ModuleKey>([FINANCE_MODULE])
  const [enrollment, hr] = await Promise.all([
    billing.isEntitledForModule(schoolId, 'enrollment').catch(() => false),
    billing.isEntitledForModule(schoolId, 'hr').catch(() => false),
  ])
  if (enrollment) set.add('enrollment')
  if (hr) set.add('hr')
  return set
}

/**
 * The org-level reachable-module set = the WIDEST licensed set across the
 * contributing schools (mirrors the shipped "org ceiling = widest in-org role"
 * briefing precedent): keep an enrollment/hr org metric if ANY contributing school
 * is entitled for that module. 'finance' is always present; enrollment/hr are
 * OR-ed over the schools, each lookup FAIL-CLOSED.
 */
export async function entitledModulesForOrg(
  schoolIds: string[],
  billing: EntitlementResolver,
): Promise<Set<ModuleKey>> {
  const set = new Set<ModuleKey>([FINANCE_MODULE])
  const results = await Promise.all(
    schoolIds.flatMap((id) => [
      billing.isEntitledForModule(id, 'enrollment').catch(() => false).then((v) => ['enrollment', v] as const),
      billing.isEntitledForModule(id, 'hr').catch(() => false).then((v) => ['hr', v] as const),
    ]),
  )
  for (const [mod, ok] of results) if (ok) set.add(mod as ModuleKey)
  return set
}

/**
 * Filter a metric list to the entitled modules, synchronously (the billing calls
 * already happened once in entitledModulesFor*). A metric whose owning module is not
 * in the set is DROPPED entirely. Generic over MetricResult and any subtype (e.g.
 * OrgMetricResult) so both surfaces share the exact filter.
 */
export function filterMetricsByEntitlement<T extends Pick<MetricResult, 'key'>>(
  metrics: T[],
  entitled: Set<ModuleKey>,
): T[] {
  return metrics.filter((m) => entitled.has(moduleForMetricKey(m.key)))
}
