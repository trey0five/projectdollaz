import { normalizeDomainWeights, type DomainMap, type DomainWeights } from '@finrep/compliance'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase B — ONE definition of "how catalog rows become a domain map".
//
// Three surfaces need the same translation from platform catalog rows to the
// pure engine's inputs: the LIVE readiness read, the RECORDED nightly snapshot,
// and the SIGNAL panel. They used to need only the assurance flag and each
// answered that with its own three-line query; adding a domain map + a signal
// map to three independent copies is exactly how a school ends up with a hero
// figure and a domain grid that describe different populations.
//
// So the translation lives here, once. Note what it deliberately does NOT do:
// it never invents a mapping. A leaf whose catalog row carries no usable domain
// contributes to NO domain and is COUNTED (`unmappedLeafCount`) so the
// confidence caveat can publish the size of that hole rather than hide it.
//
// The school-side AccreditationStandard never stores a domain — it is always
// resolved through catalogStandardId — so a map correction reaches every school
// on the next read with zero migration.
// ─────────────────────────────────────────────────────────────────────────────

/** The catalog columns this translation needs (a widened `select`, not a join). */
export interface CatalogDomainRow {
  id: string
  isAssurance?: boolean | null
  domainKey?: string | null
  domainWeights?: unknown
  signalKeys?: string[] | null
}

/** The minimum school-standard shape: an id plus its catalog back-link. */
interface LinkedStandard {
  id: string
  catalogStandardId: string | null
}

export interface ResolvedDomainMap {
  /** schoolStandardId → normalized weights (absent = maps to no domain). */
  map: DomainMap
  /** schoolStandardId → bound metric keys; ONLY standards with ≥1 binding. */
  signalKeys: Record<string, string[]>
  /** Standards handed in that resolved to NO domain at all. */
  unmappedLeafCount: number
}

/**
 * DEPLOY-ORDER SAFETY. Every one of the four surfaces that reads the catalog now
 * selects three Phase-B columns (`domain_key`, `domain_weights`, `signal_keys`).
 * The migration is strictly additive, so the SAFE ordering — migrate, then roll
 * the image — is fine. The UNSAFE ordering is the one that matters here: if the
 * Phase-B image starts before `prisma migrate deploy` lands (a rolling ECS
 * deploy, a failed migration step, a rollback that reverts the schema but not the
 * image), Postgres raises 42703 and Prisma P2022, and the STANDARDS REGISTER —
 * which worked perfectly well before this phase — 500s along with the new grid.
 *
 * That is an unacceptable blast radius for a feature nobody has seen yet. So a
 * missing-column error (and ONLY a missing-column error) degrades to the
 * assurance-only read this phase inherited: the register, the hero and the
 * nightly capture keep working exactly as they did in Phase A, and the domain
 * grid honestly reports ten uncovered domains until the migration lands.
 * Anything else rethrows — a real failure must never be swallowed.
 */
function isMissingColumnError(e: unknown): boolean {
  const err = e as { code?: unknown; meta?: { code?: unknown }; message?: unknown }
  if (err?.code === 'P2022') return true // Prisma: column does not exist
  if (err?.code === '42703' || err?.meta?.code === '42703') return true // Postgres
  return typeof err?.message === 'string' && err.message.includes('42703')
}

/**
 * Run the WIDE catalog select, falling back to the NARROW (id + isAssurance)
 * one when the Phase-B columns are not there yet. Both reads are supplied by the
 * caller so this stays free of any Prisma typing.
 */
export async function readCatalogDomainRows(
  wide: () => Promise<CatalogDomainRow[]>,
  narrow: () => Promise<{ id: string; isAssurance?: boolean | null }[]>,
): Promise<CatalogDomainRow[]> {
  try {
    return await wide()
  } catch (e) {
    if (!isMissingColumnError(e)) throw e
    const rows = await narrow()
    return rows.map((r) => ({
      id: r.id,
      isAssurance: r.isAssurance ?? null,
      domainKey: null,
      domainWeights: null,
      signalKeys: [],
    }))
  }
}

/** Catalog ids flagged isAssurance, derived in memory from an unfiltered read. */
export function assuranceIdsFrom(rows: readonly CatalogDomainRow[]): Set<string> {
  return new Set(rows.filter((r) => r.isAssurance === true).map((r) => r.id))
}

/**
 * Translate one school's standards + their catalog rows into the pure engine's
 * DomainMap and signal map.
 *
 * `standards` should already be the population the caller intends to grade (the
 * framework-scoped, non-assurance leaves for readiness; every standard for the
 * signal panel) — `unmappedLeafCount` describes exactly that population, so
 * handing in a wider set would overstate the hole.
 */
export function buildDomainMap(
  standards: readonly LinkedStandard[],
  catalogRows: readonly CatalogDomainRow[],
): ResolvedDomainMap {
  const byId = new Map<string, CatalogDomainRow>()
  for (const r of catalogRows) byId.set(r.id, r)

  const map: Record<string, DomainWeights> = {}
  const signalKeys: Record<string, string[]> = {}
  let unmappedLeafCount = 0

  for (const s of standards) {
    const row = s.catalogStandardId ? byId.get(s.catalogStandardId) : undefined
    const weights = normalizeDomainWeights(row?.domainKey ?? null, row?.domainWeights ?? null)
    if (Object.keys(weights).length === 0) {
      // A hand-made row, or a catalog row a future seed has not mapped yet.
      // Honest and common — never a reason to guess a domain.
      unmappedLeafCount += 1
    } else {
      map[s.id] = weights
    }
    const bound = row?.signalKeys ?? []
    if (bound.length > 0) signalKeys[s.id] = [...bound]
  }

  return { map, signalKeys, unmappedLeafCount }
}
