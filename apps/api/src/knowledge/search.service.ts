import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { BillingService } from '../billing/billing.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 Knowledge/Search v1 — PLATFORM-WIDE SEARCH.
//
// A cross-cutting READ over the domains the platform holds (the institutional-
// memory payoff). The Search ROUTE is CORE (not module-gated), but each per-DOMAIN
// result set is gated by module entitlement so a finance-only school never finds
// governance / accreditation / facilities records.
//
// DEP DISCIPLINE (no circular dep): this service injects ONLY PrismaService +
// BillingService and reads each domain's table PRISMA-DIRECT (mirroring the
// accreditation evidence-sources discovery pattern) — it never imports the
// governance / accreditation / facilities / workflow modules.
//
// SECURITY:
//  • TENANT ISOLATION — every findMany carries where:{ schoolId } from the path
//    param; a cross-school row is structurally impossible.
//  • CROSS-MODULE GATE — a locked domain is NEVER queried (gate-BEFORE-build), so
//    its rows can't enter the result set. FAIL-CLOSED on a billing error.
//  • INJECTION — Prisma `contains` binds `q` (no raw SQL); the DTO caps length.
//  • FAIL-SOFT — each domain query is wrapped so one broken query never 500s the
//    whole search (it contributes [] and is logged).
//
// DEFERRED (v1 boundary): Postgres full-text (tsvector/GIN), trigram/fuzzy,
// relevance ranking beyond title-first, match highlighting, more entities, per-
// item deep-link anchors, search history, a Penny search tool.
// ─────────────────────────────────────────────────────────────────────────────

/** Below this trimmed length we short-circuit to an empty result — no DB hit. */
const MIN_QUERY_LEN = 2
/** Max rows per entity (ordered updatedAt desc). */
const PER_TYPE_LIMIT = 8
/** Snippet window (chars) around the matched substring. */
const SNIPPET_RADIUS = 60

export type SearchResultType =
  | 'policy'
  | 'committee'
  | 'meeting'
  | 'task'
  | 'standard'
  | 'evidence'
  | 'maintenance'
  | 'document'
export type SearchDomain = 'core' | 'governance' | 'accreditation' | 'facilities' | 'documents'

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  snippet: string
  domain: SearchDomain
  link: string
  /** The field whose value matched `q` (for a subtle FE label); omitted if none. */
  matchedField?: string
}

export interface SearchGroup {
  domain: SearchDomain
  label: string
  count: number
  items: SearchResult[]
}

export interface SearchResponse {
  /** Echoed trimmed query (the FE guards against stale responses with this). */
  query: string
  total: number
  groups: SearchGroup[]
}

/** Stable domain order + human label (Tasks/CORE first). */
const DOMAIN_ORDER: { domain: SearchDomain; label: string }[] = [
  { domain: 'core', label: 'Tasks' },
  // Documents are CORE (always searched, no gate) — grouped right after Tasks.
  { domain: 'documents', label: 'Documents' },
  { domain: 'governance', label: 'Governance' },
  { domain: 'accreditation', label: 'Accreditation' },
  { domain: 'facilities', label: 'Facilities' },
]

const EMPTY: SearchResponse = { query: '', total: 0, groups: [] }

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Cross-domain search for one school. `q` shorter than MIN_QUERY_LEN → empty
   * (no DB / no billing call). Otherwise: resolve the per-domain gates FIRST,
   * build a query ONLY for each entitled domain, run them in parallel, FAIL-SOFT
   * per domain, then group by domain in a stable order (empty groups omitted).
   */
  async search(schoolId: string, rawQuery: string | undefined): Promise<SearchResponse> {
    const q = (rawQuery ?? '').trim()
    if (q.length < MIN_QUERY_LEN) return { ...EMPTY }

    // ── Gate BEFORE query (fail-CLOSED): a billing error → domain locked. Tasks
    // are CORE (no gate). Reaching this service implies base entitlement (the
    // EntitlementGuard already 402'd a wholly-unentitled school), so tasks run
    // unconditionally.
    const [gov, accr, fac] = await Promise.all([
      this.gate(schoolId, 'governance'),
      this.gate(schoolId, 'accreditation'),
      this.gate(schoolId, 'facilities'),
    ])

    // Build ONLY the entitled domains' queries; a locked domain is never scheduled.
    // Tasks AND documents are CORE — always searched, no gate (like tasks).
    const tasks: Promise<SearchResult[]>[] = [
      this.softFind('core', () => this.searchTasks(schoolId, q)),
      this.softFind('documents', () => this.searchDocuments(schoolId, q)),
    ]
    if (gov) {
      tasks.push(this.softFind('governance', () => this.searchPolicies(schoolId, q)))
      tasks.push(this.softFind('governance', () => this.searchCommittees(schoolId, q)))
      tasks.push(this.softFind('governance', () => this.searchMeetings(schoolId, q)))
    }
    if (accr) {
      tasks.push(this.softFind('accreditation', () => this.searchStandards(schoolId, q)))
      tasks.push(this.softFind('accreditation', () => this.searchEvidence(schoolId, q)))
    }
    if (fac) tasks.push(this.softFind('facilities', () => this.searchMaintenance(schoolId, q)))

    const settled = await Promise.all(tasks)
    const all = settled.flat()

    // Group by domain in the stable order; drop empty groups; count + total.
    const groups: SearchGroup[] = []
    let total = 0
    for (const { domain, label } of DOMAIN_ORDER) {
      const items = all.filter((r) => r.domain === domain)
      if (items.length === 0) continue
      groups.push({ domain, label, count: items.length, items })
      total += items.length
    }
    return { query: q, total, groups }
  }

  // ── Gate helper: fail-CLOSED (a thrown billing error → NOT entitled) ─────────
  private async gate(schoolId: string, moduleKey: string): Promise<boolean> {
    try {
      return await this.billing.isEntitledForModule(schoolId, moduleKey)
    } catch (err) {
      this.logger.warn(`gate ${moduleKey} failed for ${schoolId}: ${String(err)} — treating as locked`)
      return false
    }
  }

  // ── Fail-SOFT wrapper: a broken domain query contributes [] (never 500s) ─────
  private async softFind(
    domain: SearchDomain,
    run: () => Promise<SearchResult[]>,
  ): Promise<SearchResult[]> {
    try {
      return await run()
    } catch (err) {
      this.logger.warn(`search domain ${domain} failed: ${String(err)}`)
      return []
    }
  }

  // ── Per-entity queries (tenant-scoped, case-insensitive contains) ────────────

  private contains(q: string) {
    return { contains: q, mode: 'insensitive' as const }
  }

  private async searchPolicies(schoolId: string, q: string): Promise<SearchResult[]> {
    const rows = await this.prisma.policy.findMany({
      where: {
        schoolId,
        OR: [
          { title: this.contains(q) },
          { category: this.contains(q) },
          { owner: this.contains(q) },
          { notes: this.contains(q) },
        ],
      },
      select: { id: true, title: true, category: true, owner: true, notes: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: PER_TYPE_LIMIT,
    })
    return this.rankAndMap(rows, q, {
      type: 'policy',
      domain: 'governance',
      link: '/governance',
      titleFields: ['title'],
      fieldOrder: ['title', 'category', 'owner', 'notes'],
    })
  }

  private async searchCommittees(schoolId: string, q: string): Promise<SearchResult[]> {
    const rows = await this.prisma.committee.findMany({
      where: {
        schoolId,
        OR: [
          { name: this.contains(q) },
          { kind: this.contains(q) },
          { chair: this.contains(q) },
          { description: this.contains(q) },
        ],
      },
      select: { id: true, name: true, kind: true, chair: true, description: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: PER_TYPE_LIMIT,
    })
    return this.rankAndMap(rows, q, {
      type: 'committee',
      domain: 'governance',
      link: '/governance',
      titleFields: ['name'],
      fieldOrder: ['name', 'kind', 'chair', 'description'],
      displayTitle: (r) => String(r.name ?? ''),
    })
  }

  private async searchMeetings(schoolId: string, q: string): Promise<SearchResult[]> {
    // Value-safe: searches the text the user typed against title/agenda/decisions/
    // minutes; no attendee PII beyond the stored governance record.
    const rows = await this.prisma.meeting.findMany({
      where: {
        schoolId,
        OR: [
          { title: this.contains(q) },
          { agenda: this.contains(q) },
          { decisions: this.contains(q) },
          { minutes: this.contains(q) },
        ],
      },
      select: { id: true, title: true, agenda: true, decisions: true, minutes: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: PER_TYPE_LIMIT,
    })
    return this.rankAndMap(rows, q, {
      type: 'meeting',
      domain: 'governance',
      link: '/governance',
      titleFields: ['title'],
      fieldOrder: ['title', 'agenda', 'decisions', 'minutes'],
    })
  }

  private async searchTasks(schoolId: string, q: string): Promise<SearchResult[]> {
    const rows = await this.prisma.task.findMany({
      where: {
        schoolId,
        OR: [{ title: this.contains(q) }, { description: this.contains(q) }],
      },
      select: { id: true, title: true, description: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: PER_TYPE_LIMIT,
    })
    return this.rankAndMap(rows, q, {
      type: 'task',
      domain: 'core',
      link: '/tasks',
      titleFields: ['title'],
      fieldOrder: ['title', 'description'],
    })
  }

  private async searchDocuments(schoolId: string, q: string): Promise<SearchResult[]> {
    // Documents are CORE — always searched (no gate), tenant-scoped by schoolId.
    // NOTE: `tags` is a scalar String[] — Prisma has no case-insensitive contains on a
    // list, so tags use `has` (exact-tag match); title/description/fileName carry the
    // insensitive contains. (v1 limitation.)
    const rows = await this.prisma.knowledgeDocument.findMany({
      where: {
        schoolId,
        OR: [
          { title: this.contains(q) },
          { description: this.contains(q) },
          { fileName: this.contains(q) },
          { tags: { has: q } },
        ],
      },
      select: { id: true, title: true, description: true, fileName: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: PER_TYPE_LIMIT,
    })
    return this.rankAndMap(rows, q, {
      type: 'document',
      domain: 'documents',
      link: '/knowledge',
      titleFields: ['title', 'fileName'],
      fieldOrder: ['title', 'description', 'fileName'],
    })
  }

  private async searchStandards(schoolId: string, q: string): Promise<SearchResult[]> {
    const rows = await this.prisma.accreditationStandard.findMany({
      where: {
        schoolId,
        OR: [
          { code: this.contains(q) },
          { title: this.contains(q) },
          { category: this.contains(q) },
          { owner: this.contains(q) },
          { notes: this.contains(q) },
        ],
      },
      select: {
        id: true,
        code: true,
        title: true,
        category: true,
        owner: true,
        notes: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: PER_TYPE_LIMIT,
    })
    return this.rankAndMap(rows, q, {
      type: 'standard',
      domain: 'accreditation',
      link: '/accreditation',
      // code leads: standards are code-referenced. Both code+title count as "title".
      titleFields: ['code', 'title'],
      fieldOrder: ['code', 'title', 'category', 'owner', 'notes'],
      // Display title = "CODE — title".
      displayTitle: (r) => (r.code ? `${r.code} — ${r.title}` : String(r.title)),
    })
  }

  private async searchEvidence(schoolId: string, q: string): Promise<SearchResult[]> {
    // AccreditationEvidence carries a DENORMALIZED schoolId — filter it directly,
    // never join through the standard.
    const rows = await this.prisma.accreditationEvidence.findMany({
      where: {
        schoolId,
        OR: [
          { title: this.contains(q) },
          { notes: this.contains(q) },
          { reference: this.contains(q) },
        ],
      },
      select: { id: true, title: true, notes: true, reference: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: PER_TYPE_LIMIT,
    })
    return this.rankAndMap(rows, q, {
      type: 'evidence',
      domain: 'accreditation',
      link: '/accreditation',
      titleFields: ['title'],
      fieldOrder: ['title', 'notes', 'reference'],
    })
  }

  private async searchMaintenance(schoolId: string, q: string): Promise<SearchResult[]> {
    const rows = await this.prisma.maintenanceItem.findMany({
      where: {
        schoolId,
        OR: [
          { title: this.contains(q) },
          { location: this.contains(q) },
          { category: this.contains(q) },
          { notes: this.contains(q) },
        ],
      },
      select: { id: true, title: true, location: true, category: true, notes: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: PER_TYPE_LIMIT,
    })
    return this.rankAndMap(rows, q, {
      type: 'maintenance',
      domain: 'facilities',
      link: '/facilities',
      titleFields: ['title'],
      fieldOrder: ['title', 'location', 'category', 'notes'],
    })
  }

  // ── Rank (title-first, then updatedAt desc) + map to unified results ─────────
  private rankAndMap(
    rows: Array<Record<string, unknown>>,
    q: string,
    cfg: {
      type: SearchResultType
      domain: SearchDomain
      link: string
      /** fields that count as a primary (title/code) match for ranking. */
      titleFields: string[]
      /** fields checked IN ORDER to compute matchedField + snippet. */
      fieldOrder: string[]
      displayTitle?: (r: Record<string, unknown>) => string
    },
  ): SearchResult[] {
    const needle = q.toLowerCase()
    const mapped = rows.map((r) => {
      const matched = this.firstMatchedField(r, cfg.fieldOrder, needle)
      const titleMatched = matched != null && cfg.titleFields.includes(matched)
      const snippetSource = matched ? String(r[matched] ?? '') : String(r.title ?? '')
      return {
        result: {
          type: cfg.type,
          id: String(r.id),
          title: cfg.displayTitle ? cfg.displayTitle(r) : String(r.title ?? ''),
          snippet: this.snippet(snippetSource, needle),
          domain: cfg.domain,
          link: cfg.link,
          ...(matched ? { matchedField: matched } : {}),
        } satisfies SearchResult,
        // rank key: 0 = title/code matched (sorts first), 1 = body-only match.
        score: titleMatched ? 0 : 1,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.getTime() : 0,
      }
    })
    mapped.sort((a, b) => a.score - b.score || b.updatedAt - a.updatedAt)
    return mapped.map((m) => m.result)
  }

  /** First field (in order) whose lowercased value contains the needle. */
  private firstMatchedField(
    row: Record<string, unknown>,
    fieldOrder: string[],
    needle: string,
  ): string | undefined {
    for (const f of fieldOrder) {
      const v = row[f]
      if (typeof v === 'string' && v.toLowerCase().includes(needle)) return f
    }
    return undefined
  }

  /** A ~120-char whitespace-collapsed window centered on the match. */
  private snippet(value: string, needle: string): string {
    const clean = value.replace(/\s+/g, ' ').trim()
    if (clean.length <= SNIPPET_RADIUS * 2) return clean
    const idx = clean.toLowerCase().indexOf(needle)
    if (idx < 0) return clean.slice(0, SNIPPET_RADIUS * 2).trimEnd() + '…'
    const start = Math.max(0, idx - SNIPPET_RADIUS)
    const end = Math.min(clean.length, idx + needle.length + SNIPPET_RADIUS)
    const prefix = start > 0 ? '…' : ''
    const suffix = end < clean.length ? '…' : ''
    return prefix + clean.slice(start, end).trim() + suffix
  }
}
