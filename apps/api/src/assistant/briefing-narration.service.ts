// ─────────────────────────────────────────────────────────────────────────────
// "Penny narrates the briefing" — orchestration (Path A).
//
// A dedicated, server-COMPOSED and VALIDATED narration endpoint (per scope) that
// grounds on the EXACT lens-shaped briefing (re-fetched server-side, never client-
// supplied) via BriefingService / OrgBriefingService, runs ONE no-tools LLM call
// (10s local race), VALIDATES the reply against the source items (numeric-token +
// governance-voice guards, per-segment template fallback), and returns a structured
// segment array. Deterministic template narration is the no-LLM / failure path — the
// feature works with zero LLM. The existing chat get_briefing tool is UNCHANGED.
//
// All composition + validation is the pure narration.compose module; this service
// only does I/O (role/period resolution, fetch, cache, LLM call). No narration text
// is logged (counts only).
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable, Logger } from '@nestjs/common'
import type { User } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { BriefingService } from '../analytics/briefing.service.js'
import { OrgBriefingService } from '../analytics/org-briefing.service.js'
import { LENS_LABEL, type Lens } from '../analytics/briefing-lens.js'
import type { AttentionItem } from '../analytics/briefing.service.js'
import type { OrgAttentionItem } from '../analytics/org-briefing.service.js'
import { AssistantClient } from './assistant.client.js'
import {
  NARRATE_CAP,
  assembleSegments,
  buildNarrationPrompt,
  buildTemplateNarration,
  hashBriefingItems,
  parseNarrationJson,
  type BriefingNarrationResponse,
  type DayPart,
  type NarrationPayload,
  type NarrationSegment,
  type NarrationSourceItem,
  type ParsedNarration,
} from './narration.compose.js'
import type { NarrateBriefingDto, NarrateOrgBriefingDto } from './dto/narrate-briefing.dto.js'

// In-memory content-hash cache (single API container). A hit requires the key AND a
// matching item hash, so any underlying data change self-invalidates. LRU ~200, TTL
// 6h. Narration is derived + day-scale, so losing it on restart is fine (it just
// regenerates) — no DB table, no migration, no risk of serving a stale narration.
const CACHE_MAX = 200
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
// The LLM call is bounded far tighter than the client's own 30s cap — a landing card
// must degrade to the (instant) template rather than hang.
const LLM_TIMEOUT_MS = 10_000

interface CacheEntry {
  hash: string
  response: BriefingNarrationResponse
  expires: number
}

@Injectable()
export class BriefingNarrationService {
  private readonly logger = new Logger(BriefingNarrationService.name)
  private readonly cache = new Map<string, CacheEntry>()

  constructor(
    private readonly client: AssistantClient,
    private readonly briefing: BriefingService,
    private readonly orgBriefing: OrgBriefingService,
    private readonly periods: PeriodsService,
    private readonly prisma: PrismaService,
  ) {}

  // ── SCHOOL SCOPE ────────────────────────────────────────────────────────────
  async narrateSchool(
    schoolId: string,
    user: User,
    dto: NarrateBriefingDto,
  ): Promise<BriefingNarrationResponse> {
    const dayPart: DayPart = dto.dayPart ?? 'morning'
    // Same membership read AssistantService uses; fail-safe to the NARROWEST lens.
    const role = (await this.resolveRole(schoolId, user.id)) ?? 'viewer'
    const periodId = await this.resolvePeriodId(schoolId, dto.periodId)

    // No resolvable period (school has no fiscal periods yet) → an all-clear template
    // rather than a 500. Rare; the normal empty state is the no-snapshot item below.
    if (!periodId) {
      const payload = this.emptySchoolPayload(role)
      const generatedAt = new Date().toISOString()
      const segments = buildTemplateNarration(payload, dayPart)
      return this.buildSchoolResponse({
        payload,
        segments,
        source: 'template',
        cached: false,
        generatedAt,
        briefingGeneratedAt: generatedAt,
        periodId: null,
        periodLabel: null,
      })
    }

    const b = await this.briefing.getBriefing(schoolId, periodId, role, dto.lens, user.id)
    const summary = b.summary
    const narrated = b.items.slice(0, NARRATE_CAP)
    const payload: NarrationPayload = {
      scope: 'school',
      lens: b.lens,
      lensLabel: LENS_LABEL[b.lens],
      summary,
      items: narrated.map((i) => this.toSourceItem(i)),
      omittedItemCount: Math.max(0, summary.total - narrated.length),
    }

    const cacheKey = `school:${schoolId}:${b.periodId}:${b.lens}:${dayPart}`
    const hash = hashBriefingItems(payload.items, summary)

    const cached = this.probeCache(cacheKey, hash, dto.regenerate)
    if (cached) return { ...cached, cached: true }

    const generatedAt = new Date().toISOString()
    const { source, segments } = await this.compose(payload, dayPart)
    const response = this.buildSchoolResponse({
      payload,
      segments,
      source,
      cached: false,
      generatedAt,
      briefingGeneratedAt: b.generatedAt,
      periodId: b.periodId,
      periodLabel: b.label,
    })
    this.store(cacheKey, hash, response)
    return response
  }

  // ── ORG SCOPE ───────────────────────────────────────────────────────────────
  async narrateOrg(
    user: User,
    orgId: string,
    dto: NarrateOrgBriefingDto,
  ): Promise<BriefingNarrationResponse> {
    const dayPart: DayPart = dto.dayPart ?? 'morning'
    const fiscalYearStart = dto.fiscalYearStart ?? null
    // getOrgBriefing self-authorizes (org isolation + widest-in-org lens ceiling) and
    // throws Forbidden/NotFound for a bad org — let those propagate, exactly like the
    // GET org briefing controller.
    const b = await this.orgBriefing.getOrgBriefing(user, orgId, fiscalYearStart, dto.lens)

    const summary = {
      total: b.consolidated.total,
      critical: b.consolidated.critical,
      warn: b.consolidated.warn,
      info: b.consolidated.info,
    }
    const orgMeta = {
      schoolsReporting: b.consolidated.schoolsReporting,
      schoolCount: b.consolidated.schoolCount,
      notReported: b.notReported.map((n) => n.name),
    }
    const narrated = b.items.slice(0, NARRATE_CAP)
    const payload: NarrationPayload = {
      scope: 'org',
      lens: b.lens,
      lensLabel: LENS_LABEL[b.lens],
      summary,
      items: narrated.map((i) => this.toOrgSourceItem(i)),
      orgMeta,
      // "…and N more on your board below" must count what's actually ON the board:
      // the org list is itself server-capped (b.items), which can be far below the
      // consolidated total, so base this on the displayed list, not summary.total (N3).
      omittedItemCount: Math.max(0, b.items.length - narrated.length),
    }

    const cacheKey = `org:${orgId}:${fiscalYearStart ?? 'latest'}:${b.lens}:${dayPart}`
    const hash = hashBriefingItems(payload.items, summary)

    const cached = this.probeCache(cacheKey, hash, dto.regenerate)
    if (cached) return { ...cached, cached: true }

    const generatedAt = new Date().toISOString()
    const { source, segments } = await this.compose(payload, dayPart)
    const response: BriefingNarrationResponse = {
      scope: 'org',
      lens: b.lens,
      source,
      cached: false,
      generatedAt,
      briefingGeneratedAt: b.generatedAt,
      periodId: null,
      periodLabel: null,
      fiscalYearStart: b.fiscalYearStart,
      summary,
      orgMeta,
      narratedItemCount: payload.items.length,
      omittedItemCount: payload.omittedItemCount,
      segments,
    }
    this.store(cacheKey, hash, response)
    return response
  }

  // ── COMPOSE (LLM race → validate, or template fallback) ───────────────────────
  private async compose(
    payload: NarrationPayload,
    dayPart: DayPart,
  ): Promise<{ source: 'llm' | 'template'; segments: NarrationSegment[] }> {
    // ALWAYS-template moments (no LLM spend): zero items, a single get-started
    // no-snapshot item, or an org where no school has reported yet. Deterministic.
    if (this.isAlwaysTemplate(payload) || !this.client.isConfigured()) {
      return { source: 'template', segments: buildTemplateNarration(payload, dayPart) }
    }

    let parsed: ParsedNarration | null = null
    try {
      const messages = buildNarrationPrompt(payload, dayPart)
      const msg = await this.race(this.client.chat(messages, []), LLM_TIMEOUT_MS)
      parsed = parseNarrationJson(msg.content ?? '')
    } catch (e) {
      // Counts/reason only — never the (untrusted-input-derived) narration text.
      this.logger.warn(`narration LLM unavailable (${payload.scope}); serving template: ${errMsg(e)}`)
      parsed = null
    }

    if (!parsed) return { source: 'template', segments: buildTemplateNarration(payload, dayPart) }
    return { source: 'llm', segments: assembleSegments(payload, dayPart, parsed) }
  }

  private isAlwaysTemplate(payload: NarrationPayload): boolean {
    if (payload.summary.total === 0) return true
    if (payload.scope === 'org') {
      return !!payload.orgMeta && payload.orgMeta.schoolsReporting === 0
    }
    return payload.items.length === 1 && payload.items[0].id === 'data:no-snapshot'
  }

  private race<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('narration timeout')), ms)),
    ])
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────
  private buildSchoolResponse(a: {
    payload: NarrationPayload
    segments: NarrationSegment[]
    source: 'llm' | 'template'
    cached: boolean
    generatedAt: string
    briefingGeneratedAt: string
    periodId: string | null
    periodLabel: string | null
  }): BriefingNarrationResponse {
    return {
      scope: 'school',
      lens: a.payload.lens,
      source: a.source,
      cached: a.cached,
      generatedAt: a.generatedAt,
      briefingGeneratedAt: a.briefingGeneratedAt,
      periodId: a.periodId,
      periodLabel: a.periodLabel,
      fiscalYearStart: null,
      summary: a.payload.summary,
      narratedItemCount: a.payload.items.length,
      omittedItemCount: a.payload.omittedItemCount,
      segments: a.segments,
    }
  }

  private toSourceItem(i: AttentionItem): NarrationSourceItem {
    return {
      id: i.id,
      severity: i.severity,
      source: i.source,
      title: i.title,
      why: i.why,
      link: i.link,
      dueDate: i.dueDate,
      voice: i.voice ?? null,
    }
  }

  private toOrgSourceItem(i: OrgAttentionItem): NarrationSourceItem {
    return {
      id: i.orgItemId,
      severity: i.severity,
      source: i.source,
      title: i.title,
      why: i.why,
      link: i.link,
      dueDate: i.dueDate,
      voice: i.voice ?? null,
      schoolName: i.schoolName,
    }
  }

  private emptySchoolPayload(lens: Lens): NarrationPayload {
    return {
      scope: 'school',
      lens,
      lensLabel: LENS_LABEL[lens],
      summary: { total: 0, critical: 0, warn: 0, info: 0 },
      items: [],
      omittedItemCount: 0,
    }
  }

  /** Same membership read AssistantService.resolveRole uses; null when not an active member. */
  private async resolveRole(schoolId: string, userId: string): Promise<Lens | null> {
    try {
      const m = await this.prisma.membership.findUnique({
        where: { userId_schoolId: { userId, schoolId } },
      })
      if (!m || m.status !== 'active') return null
      const role = m.role
      return role === 'owner' || role === 'accountant' || role === 'viewer' ? role : null
    } catch {
      return null
    }
  }

  /** Mirror AssistantService.resolvePeriod's fallback: honour a valid owned period,
   *  else the latest snapshot-bearing period, else the newest; null when none. */
  private async resolvePeriodId(schoolId: string, requested?: string): Promise<string | null> {
    if (requested) {
      try {
        const p = await this.periods.getOwnedPeriod(schoolId, requested)
        if (p) return p.id
      } catch {
        /* not a real owned period (e.g. a label, not a UUID) — fall through */
      }
    }
    const periods = await this.periods.listPeriods(schoolId).catch(() => [])
    const withSnap = periods.find((p) => p.hasSnapshot) ?? periods[0]
    return withSnap?.id ?? null
  }

  // ── CACHE ───────────────────────────────────────────────────────────────────
  private probeCache(
    key: string,
    hash: string,
    regenerate?: boolean,
  ): BriefingNarrationResponse | null {
    if (regenerate) return null
    const entry = this.cache.get(key)
    if (!entry) return null
    if (entry.hash !== hash || entry.expires <= Date.now()) {
      this.cache.delete(key)
      return null
    }
    // Refresh recency (Map keeps insertion order → oldest is first).
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.response
  }

  private store(key: string, hash: string, response: BriefingNarrationResponse): void {
    this.cache.set(key, { hash, response, expires: Date.now() + CACHE_TTL_MS })
    if (this.cache.size > CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
