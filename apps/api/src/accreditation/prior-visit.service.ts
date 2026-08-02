import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma, PriorVisitFinding } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type {
  CreatePriorVisitFindingDto,
  ListPriorVisitFindingsQueryDto,
  UpdatePriorVisitFindingDto,
} from './dto/prior-visit.dto.js'

/**
 * THE FROZEN SENTENCE for a citation we could not match to a standard in the
 * school's register. Composed on the SERVER and rendered VERBATIM by the web — the
 * client composes no honesty copy.
 */
export const PRIOR_VISIT_UNMATCHED_NOTE =
  'We could not match these citations to a standard in your register. We show them ' +
  'exactly as the team wrote them rather than guessing which standard they meant — ' +
  'a citation matched to the wrong standard is worse than an unmatched one.'

/** One prior-visit finding as returned to the client, with its MATCH RESULT. */
export interface PriorVisitFindingPublic {
  id: string
  frameworkId: string | null
  /** yyyy-mm-dd (@db.Date). */
  visitDate: string
  /** VERBATIM as the school entered it — never normalised on the way out. */
  citedStandardCode: string
  text: string
  status: string
  closedDate: string | null
  evidenceRef: string | null
  /** The school standard this citation matched, or null. */
  matchedStandardId: string | null
  /** That standard's code AS THE SCHOOL WROTE IT (not the citation's casing). */
  matchedStandardCode: string | null
  /** True ⇔ matchedStandardId === null. Never hidden, never dropped. */
  unmatched: boolean
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface PriorVisitListResponse {
  findings: PriorVisitFindingPublic[]
  /**
   * The frozen sentence above when ANY row in the school's register is unmatched;
   * null otherwise. Present on the LIST because the note explains a property of the
   * register, not of one row.
   */
  unmatchedNote: string | null
  /** How many rows in the school's register carry no matched standard. */
  unmatchedCount: number
}

/**
 * THE ONLY NORMALISATION THIS FILE PERFORMS: trim + uppercase.
 *
 * Matching is EXACT EQUALITY after this and NOTHING ELSE. No prefix match, no
 * substring match, no Levenshtein, no 'COG-A3 ≈ COG-3', no normalising of
 * separators, no stripping of a framework prefix. A citation matched to the wrong
 * standard is worse than an unmatched one, and it is worse in the specific way that
 * matters here: it would put a visiting team's words under a standard they did not
 * cite, and G3 would then render a finding that misquotes the team.
 */
function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

function toIsoDate(d: Date | null): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

function parseIsoDate(
  s: string | null | undefined,
  field: string,
): Date | null | undefined {
  if (s === undefined) return undefined
  if (s === null) return null
  const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid ${field}: ${s}.`)
  return d
}

/**
 * Reject an explicit `null` on a column the database declares NOT NULL.
 *
 * WHY THIS EXISTS: `@IsOptional()` skips validation for BOTH `undefined` AND
 * `null` — the semantics the whole codebase relies on so a PATCH can CLEAR a
 * nullable field. The side effect is that `{"text": null}` sails past
 * `@IsOptional() @IsString()` on a PATCH DTO, reaches Prisma, and comes back as a
 * 500 from a NOT NULL violation instead of the 400 it is. `frameworkId`,
 * `closedDate` and `evidenceRef` ARE nullable and are deliberately absent below.
 */
function rejectNullOnRequired(
  dto: Record<string, unknown>,
  fields: readonly string[],
): void {
  for (const field of fields) {
    if (dto[field] === null) {
      throw new BadRequestException(`${field} cannot be cleared — it is required.`)
    }
  }
}

/** Deterministic list order: open before closed, then most recent visit first. */
function compareFindings(a: PriorVisitFindingPublic, b: PriorVisitFindingPublic): number {
  const oa = a.status === 'open' ? 0 : 1
  const ob = b.status === 'open' ? 0 : 1
  if (oa !== ob) return oa - ob
  if (a.visitDate !== b.visitDate) return b.visitDate.localeCompare(a.visitDate)
  const c = a.citedStandardCode.localeCompare(b.citedStandardCode)
  return c !== 0 ? c : a.id.localeCompare(b.id)
}

/**
 * AIC Phase F — the PRIOR VISIT FINDINGS register service.
 *
 * THE ONLY GROUND TRUTH IN THE PROGRAM: what a real visiting team actually wrote,
 * and whether the school has closed it. Everything else the twin says is inference
 * from the school's own records; this is inference from nobody.
 *
 * HARD PROHIBITION (plan G10, D4 frozen): NOTHING here may calibrate a probability
 * or a likelihood. One visit per six years per school is never calibratable. This
 * service returns rows and a match result; it computes no score, no weight, no rate
 * and no percentage, and the rule that reads it (ACC-PRIOR-FINDING-OPEN) carries a
 * LITERAL severity, likelihood and confidence for the same reason.
 *
 * TENANT ISOLATION on every read and write: reads filter by `schoolId`, mutations
 * resolve `where { id, schoolId }` first, so a foreign id 404s before anything loads.
 */
@Injectable()
export class PriorVisitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The school's own standard register, indexed by NORMALISED code.
   *
   * A school register does not enforce unique codes (AccreditationStandard.code is
   * free text, "deliberately NOT unique"), so a code can genuinely appear twice. The
   * tie is broken by id ascending — an arbitrary rule, but a STABLE one, so the same
   * citation never flips between two standards from one request to the next.
   */
  private async standardIndex(
    schoolId: string,
  ): Promise<Map<string, { id: string; code: string }>> {
    const standards = await this.prisma.accreditationStandard.findMany({
      where: { schoolId },
      select: { id: true, code: true },
      orderBy: { id: 'asc' },
    })
    const index = new Map<string, { id: string; code: string }>()
    for (const s of standards) {
      const key = normalizeCode(s.code)
      if (!index.has(key)) index.set(key, s)
    }
    return index
  }

  private toPublic(
    row: PriorVisitFinding,
    index: Map<string, { id: string; code: string }>,
  ): PriorVisitFindingPublic {
    const match = index.get(normalizeCode(row.citedStandardCode)) ?? null
    return {
      id: row.id,
      frameworkId: row.frameworkId,
      visitDate: toIsoDate(row.visitDate)!,
      // VERBATIM. The stored text is the team's, and it stays the team's.
      citedStandardCode: row.citedStandardCode,
      text: row.text,
      status: row.status,
      closedDate: toIsoDate(row.closedDate),
      evidenceRef: row.evidenceRef,
      matchedStandardId: match?.id ?? null,
      matchedStandardCode: match?.code ?? null,
      unmatched: match === null,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** 400 when a supplied frameworkId is unknown or inactive. Null/omitted passes. */
  private async assertFramework(frameworkId: string): Promise<void> {
    const framework = await this.prisma.accreditationFramework.findFirst({
      where: { id: frameworkId, active: true },
      select: { id: true },
    })
    if (!framework) throw new BadRequestException('Accreditation framework not found or inactive.')
  }

  private async resolveFinding(
    schoolId: string,
    findingId: string,
  ): Promise<PriorVisitFinding> {
    const row = await this.prisma.priorVisitFinding.findFirst({
      where: { id: findingId, schoolId },
    })
    if (!row) throw new NotFoundException('Prior-visit finding not found.')
    return row
  }

  /**
   * List the register. `status` / `frameworkId` filter in the DB; `unmatchedOnly`
   * filters after matching, because "unmatched" is a property of a JOIN against the
   * school's standards and not of the row.
   *
   * `unmatchedNote` and `unmatchedCount` are computed over the school's FULL
   * register, never over the filtered page — the note explains the register.
   * An unmatched row is NEVER dropped from an unfiltered response.
   */
  async list(
    schoolId: string,
    query: ListPriorVisitFindingsQueryDto = {},
  ): Promise<PriorVisitListResponse> {
    const where: Prisma.PriorVisitFindingWhereInput = { schoolId }
    if (query.status !== undefined) where.status = query.status
    if (query.frameworkId !== undefined) where.frameworkId = query.frameworkId
    // `unmatchedOnly` is NOT in this list: it is applied in memory below, so the
    // first query still returns the whole register when it is the only filter.
    const dbFiltered = query.status !== undefined || query.frameworkId !== undefined

    const [index, rows] = await Promise.all([
      this.standardIndex(schoolId),
      this.prisma.priorVisitFinding.findMany({ where }),
    ])
    // The note describes the REGISTER, so its count spans the register. A SECOND
    // query is issued only when the first was narrowed at the DB level.
    const allRows = dbFiltered
      ? await this.prisma.priorVisitFinding.findMany({
          where: { schoolId },
          select: { citedStandardCode: true },
        })
      : rows

    const unmatchedCount = allRows.filter(
      (r) => !index.has(normalizeCode(r.citedStandardCode)),
    ).length

    let findings = rows.map((r) => this.toPublic(r, index))
    if (query.unmatchedOnly === 'true') findings = findings.filter((f) => f.unmatched)
    if (query.unmatchedOnly === 'false') findings = findings.filter((f) => !f.unmatched)
    findings.sort(compareFindings)

    return {
      findings,
      unmatchedNote: unmatchedCount > 0 ? PRIOR_VISIT_UNMATCHED_NOTE : null,
      unmatchedCount,
    }
  }

  async create(
    schoolId: string,
    dto: CreatePriorVisitFindingDto,
    userId: string,
    now = new Date(),
  ): Promise<{ finding: PriorVisitFindingPublic }> {
    if (dto.frameworkId) await this.assertFramework(dto.frameworkId)
    const visitDate = parseIsoDate(dto.visitDate, 'visitDate') as Date
    const status = dto.status ?? 'open'
    const closedDate = this.resolveClosedDate(
      status,
      parseIsoDate(dto.closedDate, 'closedDate'),
      null,
      now,
    )

    const row = await this.prisma.priorVisitFinding.create({
      data: {
        schoolId,
        frameworkId: dto.frameworkId ?? null,
        visitDate,
        // Stored VERBATIM as entered. Normalisation is a match-time concern only.
        citedStandardCode: dto.citedStandardCode,
        text: dto.text,
        status,
        closedDate,
        evidenceRef: dto.evidenceRef ?? null,
        createdByUserId: userId,
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.prior_visit_finding.created',
      targetType: 'accreditation_prior_visit_findings',
      targetId: row.id,
    })
    return { finding: this.toPublic(row, await this.standardIndex(schoolId)) }
  }

  async update(
    schoolId: string,
    findingId: string,
    dto: UpdatePriorVisitFindingDto,
    userId: string,
    now = new Date(),
  ): Promise<{ finding: PriorVisitFindingPublic }> {
    const existing = await this.resolveFinding(schoolId, findingId)
    // 400, not 500: see rejectNullOnRequired. frameworkId / closedDate /
    // evidenceRef ARE nullable and stay clearable.
    rejectNullOnRequired(dto as Record<string, unknown>, [
      'visitDate',
      'citedStandardCode',
      'text',
      'status',
    ])
    if (dto.frameworkId) await this.assertFramework(dto.frameworkId)
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const visitDate = parseIsoDate(dto.visitDate, 'visitDate')
    const closedDateIn = parseIsoDate(dto.closedDate, 'closedDate')
    const status = pick(dto.status, existing.status)

    const row = await this.prisma.priorVisitFinding.update({
      where: { id: existing.id },
      data: {
        frameworkId: pick(dto.frameworkId, existing.frameworkId),
        visitDate: pick(visitDate, existing.visitDate) as Date,
        citedStandardCode: pick(dto.citedStandardCode, existing.citedStandardCode),
        text: pick(dto.text, existing.text),
        status,
        closedDate: this.resolveClosedDate(status, closedDateIn, existing.closedDate, now),
        evidenceRef: pick(dto.evidenceRef, existing.evidenceRef),
        // createdByUserId is NEVER overwritten (provenance).
      },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.prior_visit_finding.updated',
      targetType: 'accreditation_prior_visit_findings',
      targetId: row.id,
    })
    return { finding: this.toPublic(row, await this.standardIndex(schoolId)) }
  }

  async remove(
    schoolId: string,
    findingId: string,
    userId: string,
  ): Promise<{ id: string }> {
    const existing = await this.resolveFinding(schoolId, findingId)
    await this.prisma.priorVisitFinding.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'accreditation.prior_visit_finding.deleted',
      targetType: 'accreditation_prior_visit_findings',
      targetId: existing.id,
    })
    return { id: existing.id }
  }

  /**
   * The closedDate lifecycle, in ONE place so create and update cannot disagree:
   *
   *  • status 'open'   → closedDate is CLEARED, always. A finding that is open has
   *    no close date, and leaving a stale one would let the register say two things
   *    at once. Re-opening and re-closing without a date therefore re-stamps today,
   *    which is correct: it WAS closed on a new day.
   *  • status 'closed' + an explicit date → that date (an explicit `null` means "no
   *    date given", so it falls through to today).
   *  • status 'closed' + no date → the date already stored, or TODAY when there is
   *    none. A close date is never silently moved by an unrelated edit.
   *
   * This is apps/api, not the pure package, so reading a clock is legal here; `now`
   * is still a parameter so the spec pins the behaviour without freezing time.
   */
  private resolveClosedDate(
    status: string,
    supplied: Date | null | undefined,
    current: Date | null,
    now: Date,
  ): Date | null {
    if (status !== 'closed') return null
    if (supplied !== undefined && supplied !== null) return supplied
    if (supplied === undefined && current !== null) return current
    return new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`)
  }
}
