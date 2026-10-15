// ─────────────────────────────────────────────────────────────────────────────
// intakeMemory — what KYRO remembers about one school's uploads (#32 / #41).
//
//   • layouts   — column layouts somebody picked for a file KYRO couldn't read,
//                 so the next file laid out the same way just works;
//   • synthetic — the numbers KYRO gave unnumbered QuickBooks P&L rows, so a
//                 re-ordered export keeps every account on the same number.
//
// It is OPTIONAL by contract: every failure (network, 403 for a viewer, an old
// API without the route, a slow server) resolves to `null`, and `null` gives
// exactly today's parse. An upload must never wait on, or fail because of, the
// memory. One in-flight/settled promise per school; a failed or timed-out read
// is not cached so the next upload tries again. Nothing here is ever sent
// anywhere — it is only handed to the in-browser parser.
// ─────────────────────────────────────────────────────────────────────────────
import { importsApi } from './api.js'

export const MEMORY_TIMEOUT_MS = 3000

const cache = new Map() // schoolId → Promise<IntakeMemory|null>

/** Shape guard: the parser trusts this object, so only pass a well-formed one. */
export function normalizeIntakeMemory(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const layouts = Array.isArray(data.layouts) ? data.layouts.filter((l) => l && typeof l === 'object') : []
  const synthetic =
    data.synthetic && typeof data.synthetic === 'object' && !Array.isArray(data.synthetic)
      ? data.synthetic
      : {}
  return { layouts, synthetic }
}

export function getIntakeMemory(schoolId, { timeoutMs = MEMORY_TIMEOUT_MS } = {}) {
  if (!schoolId) return Promise.resolve(null)
  const hit = cache.get(schoolId)
  if (hit) return hit
  let timer = null
  const p = Promise.race([
    Promise.resolve()
      .then(() => importsApi.intakeMemory(schoolId))
      .then((res) => normalizeIntakeMemory(res?.data))
      .catch(() => null),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs)
    }),
  ]).then((m) => {
    if (timer) clearTimeout(timer)
    // Don't remember a miss — the next upload should try again.
    if (m == null && cache.get(schoolId) === p) cache.delete(schoolId)
    return m
  })
  cache.set(schoolId, p)
  return p
}

/** Forget the cached memory (after a save adds a new layout / numbers). */
export function invalidateIntakeMemory(schoolId) {
  if (schoolId) cache.delete(schoolId)
  else cache.clear()
}
