// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase I — THE ORG FAN-OUT BOUND.
//
// `OrgBriefingService` shipped fanning out `Promise.allSettled` over every school
// in an organization with NO limit at all, and its own comment admitted the cost:
// each per-school briefing is ~1 metrics compute + a 4-way compliance
// `Promise.all`, so an organization of N schools issues ~5N service reads at once.
// Prisma's default pool on a 2-vCPU ECS task is `num_cpus * 2 + 1` = 5. A
// forty-school diocese therefore does not return slowly — it returns `P2024`
// (connection pool timeout), which is the shape the incident actually takes.
//
// This helper is the bound. It is deliberately a SHARED module rather than a
// third private copy: Phase I retrofits it into the existing org briefing AND
// uses it for the new portfolio's entitlement fan-out and bulk-adopt writes, and
// three copies of a concurrency limiter is three places for the number to drift.
//
// `apps/api/src/twin/twin-reconciliation.service.ts` keeps its own private copy on
// purpose. That one is in production and proven; de-duplicating it is a separate
// change and would put one file on two engineers' desks.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The org fan-out bound. FOUR. Not a suggestion, not a config value.
 *
 * It matches `RECONCILE_CONCURRENCY` in the nightly reconciliation for the same
 * reason: four in-flight workers against a pool of five leaves headroom for the
 * request that is actually serving the user.
 */
export const ORG_FANOUT_CONCURRENCY = 4

/**
 * Bounded-parallelism map.
 *
 * Contract, all three parts load-bearing:
 *   • returns `PromiseSettledResult<R>[]` in **INPUT ORDER**, never completion
 *     order — every caller indexes the results against the input array, and an
 *     org roll-up whose row order depends on which school's query finished first
 *     is a determinism bug that only shows up under load;
 *   • **never throws** — one school's failure is a `'rejected'` slot, exactly as
 *     `Promise.allSettled` would give, so a caller can be swapped over without
 *     touching any other line;
 *   • **never has more than `limit` workers in flight**.
 *
 * The shape is the cursor + fixed-runner loop already proven in
 * twin-reconciliation.service.ts, adapted to collect ordered settled results.
 * `limit` is clamped to `>= 1`; an empty input returns `[]` without starting a
 * runner.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length)
  if (items.length === 0) return out

  const bound = Math.max(1, Math.trunc(limit) || 1)
  let cursor = 0

  const runners = Array.from({ length: Math.min(bound, items.length) }, async () => {
    for (;;) {
      const i = cursor
      cursor += 1
      if (i >= items.length) return
      try {
        out[i] = { status: 'fulfilled', value: await worker(items[i], i) }
      } catch (reason) {
        // Settled, not thrown: the caller decides what a failed item means.
        out[i] = { status: 'rejected', reason }
      }
    }
  })

  await Promise.all(runners)
  return out
}
