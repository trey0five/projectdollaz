// ─────────────────────────────────────────────────────────────────────────────
// Pure civil-date arithmetic for the cash-flow engine.
//
// WHY THIS IS DUPLICATED, and it is duplicated on purpose. The identical
// algorithm lives in @finrep/compliance (review-status.ts) and this package
// cannot import it: compliance already depends on analytics, so the reverse edge
// would be a cycle. The eventual right home is @finrep/engine, which both
// packages already depend on — but moving it means touching three working,
// heavily-tested compliance files for no behaviour change, so it stays here with
// this note until something else needs it.
//
// NO CLOCK AND NO RANDOMNESS. The package purity guard bans the built-in date
// object and the random generator outright, which is exactly right for a
// forecasting engine: a projection that consults the clock gives two different
// answers on two runs, and this output goes in front of a finance committee.
// Every date here is an ISO 'YYYY-MM-DD' string and "today" is an input.
//
// (The guard greps source text, so naming those globals literally — even inside
// a comment explaining the ban — trips it. Describing them is deliberate.)
//
// Howard Hinnant's civil-from-days / days-from-civil, integer-only, no timezone.
// ─────────────────────────────────────────────────────────────────────────────

export interface Civil {
  y: number
  /** 1-12 */
  m: number
  /** 1-31 */
  d: number
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 'YYYY-MM-DD' → Civil, or null when it is not a well-formed civil date. */
export function parseIso(iso: string | null | undefined): Civil | null {
  if (typeof iso !== 'string') return null
  const m = ISO_RE.exec(iso)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > lastDayOfMonth(y, mo)) return null
  return { y, m: mo, d }
}

/** Civil → 'YYYY-MM-DD'. */
export function toIso(c: Civil): string {
  const mm = c.m < 10 ? `0${c.m}` : `${c.m}`
  const dd = c.d < 10 ? `0${c.d}` : `${c.d}`
  return `${c.y}-${mm}-${dd}`
}

/** Days since 1970-01-01. Pure integer math. */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/** Inverse of daysFromCivil. */
export function civilFromDays(z: number): Civil {
  const zz = z + 719468
  const era = Math.floor((zz >= 0 ? zz : zz - 146096) / 146097)
  const doe = zz - era * 146097
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  )
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  return { y: m <= 2 ? y + 1 : y, m, d }
}

/** Last day of (year, month 1-12) — leap-year aware. */
export function lastDayOfMonth(y: number, m: number): number {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (m === 2 && y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) return 29
  return days[m - 1] ?? 31
}

/** ISO → days since epoch, or null on a malformed date. */
export function isoToDays(iso: string | null | undefined): number | null {
  const c = parseIso(iso)
  return c ? daysFromCivil(c.y, c.m, c.d) : null
}

/** days since epoch → ISO. */
export function daysToIso(z: number): string {
  return toIso(civilFromDays(z))
}

/** ISO + n days → ISO. Returns null if the input is malformed. */
export function addDays(iso: string, n: number): string | null {
  const z = isoToDays(iso)
  return z == null ? null : daysToIso(z + n)
}

/**
 * ISO + n months → ISO, CLAMPED to the target month's last day.
 *
 * The clamp is the whole reason this is not `addDays(iso, 30 * n)`: a payment
 * dated the 31st recurring monthly must land on the 30th in June and the 28th in
 * February, not roll into the following month. A payroll run that silently slid a
 * day forward every short month would drift a week out of place across a year.
 */
export function addMonths(iso: string, n: number): string | null {
  const c = parseIso(iso)
  if (!c) return null
  const total = c.y * 12 + (c.m - 1) + n
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return toIso({ y, m, d: Math.min(c.d, lastDayOfMonth(y, m)) })
}

/** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday (4). */
export function dayOfWeek(iso: string): number | null {
  const z = isoToDays(iso)
  if (z == null) return null
  return ((z + 4) % 7 + 7) % 7
}

/** The Monday on or before `iso` — the week bucket key. */
export function startOfWeek(iso: string): string | null {
  const z = isoToDays(iso)
  const dow = dayOfWeek(iso)
  if (z == null || dow == null) return null
  // Monday-start: Sunday (0) belongs to the week that began six days earlier.
  const back = dow === 0 ? 6 : dow - 1
  return daysToIso(z - back)
}

/** 'YYYY-MM' for the month bucket key. */
export function monthKey(iso: string): string | null {
  const c = parseIso(iso)
  return c ? `${c.y}-${c.m < 10 ? `0${c.m}` : c.m}` : null
}

/** Inclusive day count between two ISO dates; null if either is malformed. */
export function daysBetween(a: string, b: string): number | null {
  const za = isoToDays(a)
  const zb = isoToDays(b)
  return za == null || zb == null ? null : zb - za
}
