import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma, StaffEvaluation } from '@finrep/db'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import {
  STAFF_EVALUATION_STATUSES,
  type CreateStaffEvaluationDto,
  type ListStaffEvaluationsQueryDto,
  type StaffEvaluationStatus,
  type UpdateStaffEvaluationDto,
} from './dto/staff-evaluation.dto.js'

/**
 * One evaluation row as returned to the client on the REGISTER routes.
 *
 * ADULT-STAFF EMPLOYMENT PII: `personName`, `personTitle` and `evaluatorName` are on
 * this shape, and this shape is reachable ONLY from the owner/accountant routes
 * (@Roles on StaffEvaluationsController — viewer gets 403). Nothing else in the
 * platform ever sees it: the twin collector selects three date/status columns, the
 * rule's evidence is four counts, and the briefing/Penny/exports render the finding.
 */
export interface StaffEvaluationPublic {
  id: string
  personId: string
  /** JOINED from GovernancePerson. PII — owner/accountant routes only. */
  personName: string
  /** JOINED from GovernancePerson. Free text ('Business Manager'), or null. */
  personTitle: string | null
  cycleLabel: string
  /** yyyy-mm-dd (@db.Date). NEVER null — the clock the overdue arithmetic reads. */
  dueDate: string
  /** yyyy-mm-dd, or null. Non-null ⇒ the evaluation happened. */
  completedDate: string | null
  evaluatorName: string | null
  status: string
  notes: string | null
  /** COMPUTED (never stored) — the ONE predicate below, against the server clock. */
  isOverdue: boolean
  /** Whole days past `dueDate` when overdue; null otherwise (never negative). */
  daysOverdue: number | null
  createdAt: string
  updatedAt: string
}

/**
 * COUNTS ONLY — the shape the `/summary` route returns, and the ONLY staff-evaluation
 * shape a `viewer` may read. There is no id, no personId and no name of any kind on
 * it, deliberately: a board viewer has no business reading which named employee is
 * overdue for an evaluation, but the COUNT is a legitimate governance fact.
 */
export interface StaffEvaluationSummary {
  /** Every row on the register, whatever its status. */
  total: number
  /** Rows satisfying the overdue predicate below. */
  overdue: number
  /** Days past due for the OLDEST still-overdue row; 0 when none is overdue. */
  oldestOverdueDays: number
  /**
   * Rows per status. A row whose stored status is outside
   * STAFF_EVALUATION_STATUSES (only a manual DB edit can produce one) is counted in
   * `total` — and in `overdue` when it is overdue — but lands in NO bucket here. We
   * would rather this not sum to `total` than file a row under a status it does not
   * have.
   */
  byStatus: Record<StaffEvaluationStatus, number>
  /** Rows with a completedDate inside the last twelve months. */
  completedLast12m: number
}

export interface StaffEvaluationListResponse {
  evaluations: StaffEvaluationPublic[]
  summary: StaffEvaluationSummary
}

/** The row shape every read path loads: the record plus its person's display fields. */
type StaffEvaluationRow = StaffEvaluation & { person: { name: string; title: string | null } }

/** The single include used everywhere a row feeds toPublic. */
const PERSON_INCLUDE = { person: { select: { name: true, title: true } } } as const

/** The group a GovernancePerson must be in to be evaluated as staff. */
const STAFF_GROUP = 'staff'

/** Serialize a DB @db.Date to yyyy-mm-dd with no timezone drift (UTC-midnight round-trip). */
function toIsoDate(d: Date | null): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

/** Parse an incoming ISO date string to a UTC-midnight Date, or throw. Null passes. */
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
 * `null` — that is the class-validator semantics the whole codebase relies on so a
 * PATCH can CLEAR a nullable field. The side effect is that `{"dueDate": null}`
 * sails past `@IsOptional() @IsDateString()` on a PATCH DTO, reaches Prisma, and
 * comes back as a 500 from a NOT NULL violation instead of the 400 it is. These
 * three columns (cycleLabel, dueDate, status) have no null form, so a null here is
 * a malformed request and is answered as one.
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

/** Whole days between two yyyy-mm-dd strings (b − a), exact at UTC midnight. */
function daysBetweenIso(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00.000Z`)
  const b = Date.parse(`${bIso}T00:00:00.000Z`)
  return Math.round((b - a) / 86_400_000)
}

/**
 * THE OVERDUE PREDICATE — AIC Phase F §3.1, clause for clause.
 *
 *   isOverdue(row, todayIso) =
 *        row.completedDate === null
 *     && row.status !== 'completed'
 *     && row.status !== 'waived'
 *     && iso(row.dueDate) < todayIso
 *
 * `completedDate !== null` WINS over any `status` value: a completed evaluation is
 * completed whatever the status column says, so no sentence can out-run the data.
 * The comparison is strict `<` — an evaluation due TODAY is not yet overdue.
 *
 * NOTE FOR REVIEW: the twin collector (apps/api/src/twin/twin-signals.service.ts)
 * carries its own copy of this predicate — it must, because it reads a
 * three-column projection that never loads a person. The two must stay identical;
 * `staff-evaluations.service.spec.ts` pins this one clause for clause, and the
 * signals spec pins the other. A shared pure helper in @finrep/compliance is the
 * right long-term home and is raised as a follow-up.
 */
function evaluationIsOverdue(
  row: { completedDate: Date | null; status: string; dueDate: Date },
  todayIso: string,
): boolean {
  if (row.completedDate !== null) return false
  if (row.status === 'completed' || row.status === 'waived') return false
  return toIsoDate(row.dueDate)! < todayIso
}

/**
 * AIC Phase F — the STAFF EVALUATION register service. The first surface under
 * apps/api/src/hr/, gated by the 'hr' entitlement module.
 *
 * ADULT-STAFF EMPLOYMENT PII. The PII contract (phase spec §4) is enforced in two
 * layers and this file owns the lower one:
 *  • the controller's @Roles keeps `viewer` off every route that returns a name;
 *  • this service exposes exactly TWO shapes — the named StaffEvaluationPublic for
 *    the register routes, and the name-free StaffEvaluationSummary for /summary.
 * No third shape exists, so there is no path by which a name reaches the briefing,
 * Penny, an export or the twin.
 *
 * NO SECOND PERSON TABLE. `personId` points at GovernancePerson, which already
 * carries `groups String[]` with 'staff' among the DTO-validated values. `create`
 * refuses a person who is not of this school or who is not in the staff group.
 *
 * TENANT ISOLATION is enforced on EVERY query: reads filter by `schoolId`, and every
 * mutation first resolves the row `where { id, schoolId }` — an evaluationId owned by
 * another school resolves to null → NotFoundException, so a cross-tenant mutation is
 * IMPOSSIBLE (the foreign row never even loads). Same discipline as FacilitiesService.
 */
@Injectable()
export class StaffEvaluationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toPublic(row: StaffEvaluationRow, todayIso: string): StaffEvaluationPublic {
    const dueIso = toIsoDate(row.dueDate)!
    const overdue = evaluationIsOverdue(row, todayIso)
    return {
      id: row.id,
      personId: row.personId,
      personName: row.person.name,
      personTitle: row.person.title,
      cycleLabel: row.cycleLabel,
      dueDate: dueIso,
      completedDate: toIsoDate(row.completedDate),
      evaluatorName: row.evaluatorName,
      status: row.status,
      notes: row.notes,
      isOverdue: overdue,
      daysOverdue: overdue ? daysBetweenIso(dueIso, todayIso) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /**
   * Validate a client-sent personId: it must be a GovernancePerson of the PATH
   * school AND carry the 'staff' group. Both failures are 400 with a message that
   * names the reason — "this person is not on your staff list" is actionable, and a
   * 404 here would wrongly imply the person does not exist.
   */
  private async resolveStaffPerson(
    schoolId: string,
    personId: string,
  ): Promise<{ id: string }> {
    const person = await this.prisma.governancePerson.findFirst({
      where: { id: personId, schoolId },
      select: { id: true, groups: true },
    })
    if (!person) throw new BadRequestException('Person not found for this school.')
    if (!person.groups.includes(STAFF_GROUP)) {
      throw new BadRequestException(
        "This person is not in the 'staff' group — add them to staff in Governance › People before recording an evaluation.",
      )
    }
    return { id: person.id }
  }

  /**
   * Resolve an evaluation that belongs to the PATH school — the tenant + existence
   * gate in ONE query. A foreign/unknown id → null → 404.
   */
  private async resolveEvaluation(
    schoolId: string,
    evaluationId: string,
  ): Promise<StaffEvaluationRow> {
    const row = await this.prisma.staffEvaluation.findFirst({
      where: { id: evaluationId, schoolId },
      include: PERSON_INCLUDE,
    })
    if (!row) throw new NotFoundException('Staff evaluation not found.')
    return row
  }

  /**
   * List the register for one school. `status` / `personId` / `cycleLabel` filter in
   * the DB; `overdue` filters IN MEMORY because the predicate depends on the server
   * clock and on the completedDate-wins rule, neither of which is expressible as a
   * single `where` without duplicating the predicate in SQL.
   *
   * `summary` is ALWAYS computed over the school's FULL register, never over the
   * filtered page — a KPI that changed when you typed in a filter box would be a lie.
   */
  async list(
    schoolId: string,
    query: ListStaffEvaluationsQueryDto = {},
    now = new Date(),
  ): Promise<StaffEvaluationListResponse> {
    const todayIso = now.toISOString().slice(0, 10)
    const where: Prisma.StaffEvaluationWhereInput = { schoolId }
    if (query.status !== undefined) where.status = query.status
    if (query.personId !== undefined) where.personId = query.personId
    // Case-insensitive EXACT match: a cycle label is a selector ('2025-26 annual
    // cycle'), not a search box, and a substring match would silently fold
    // '2025-26' into '2025-26 remediation'.
    if (query.cycleLabel !== undefined) {
      where.cycleLabel = { equals: query.cycleLabel, mode: 'insensitive' }
    }
    // `overdue` is NOT in this list: it is applied in memory below, so the first
    // query still returns the whole register when it is the only filter.
    const dbFiltered =
      query.status !== undefined || query.personId !== undefined || query.cycleLabel !== undefined

    const rows = await this.prisma.staffEvaluation.findMany({ where, include: PERSON_INCLUDE })
    // The summary is the school's, not the page's. A SECOND query is issued only
    // when the first one was narrowed at the DB level — otherwise `rows` already IS
    // the full register and re-reading it would be a query for nothing.
    const allRows = dbFiltered
      ? await this.prisma.staffEvaluation.findMany({
          where: { schoolId },
          select: { dueDate: true, completedDate: true, status: true },
        })
      : rows

    let evaluations = rows.map((r) => this.toPublic(r, todayIso))
    if (query.overdue === 'true') evaluations = evaluations.filter((e) => e.isOverdue)
    if (query.overdue === 'false') evaluations = evaluations.filter((e) => !e.isOverdue)

    // Deterministic: overdue first (the thing a head of school acts on), then by due
    // date ascending, then by id so the order never depends on Postgres.
    evaluations.sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
      if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
      return a.id.localeCompare(b.id)
    })

    return { evaluations, summary: this.summarize(allRows, todayIso) }
  }

  /**
   * COUNTS ONLY. This is the ONE route a `viewer` may call, and it is also what the
   * web KPI card binds to for EVERY role, so there is a single code path rather than
   * a role-dependent one that could drift.
   */
  async summary(schoolId: string, now = new Date()): Promise<StaffEvaluationSummary> {
    const rows = await this.prisma.staffEvaluation.findMany({
      where: { schoolId },
      // EXACTLY these three columns. No id, no personId, no evaluatorName — the
      // shape cannot leak an identity because it never loads one.
      select: { dueDate: true, completedDate: true, status: true },
    })
    return this.summarize(rows, now.toISOString().slice(0, 10))
  }

  private summarize(
    rows: readonly { dueDate: Date; completedDate: Date | null; status: string }[],
    todayIso: string,
  ): StaffEvaluationSummary {
    const byStatus = Object.fromEntries(
      STAFF_EVALUATION_STATUSES.map((s) => [s, 0]),
    ) as Record<StaffEvaluationStatus, number>

    // Twelve months back from today, at UTC midnight. Clamped by Date's own
    // month arithmetic (e.g. 2026-02-29 does not exist, so a leap-day today reads
    // back as 2025-03-01 — one day tighter, never looser).
    const cutoff = new Date(`${todayIso}T00:00:00.000Z`)
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1)
    const cutoffIso = cutoff.toISOString().slice(0, 10)

    let overdue = 0
    let oldestOverdueDays = 0
    let completedLast12m = 0

    for (const row of rows) {
      if ((STAFF_EVALUATION_STATUSES as readonly string[]).includes(row.status)) {
        byStatus[row.status as StaffEvaluationStatus] += 1
      }
      if (evaluationIsOverdue(row, todayIso)) {
        overdue += 1
        const days = daysBetweenIso(toIsoDate(row.dueDate)!, todayIso)
        if (days > oldestOverdueDays) oldestOverdueDays = days
      }
      const completedIso = toIsoDate(row.completedDate)
      if (completedIso !== null && completedIso >= cutoffIso) completedLast12m += 1
    }

    return { total: rows.length, overdue, oldestOverdueDays, byStatus, completedLast12m }
  }

  async get(
    schoolId: string,
    evaluationId: string,
    now = new Date(),
  ): Promise<{ evaluation: StaffEvaluationPublic }> {
    const row = await this.resolveEvaluation(schoolId, evaluationId)
    return { evaluation: this.toPublic(row, now.toISOString().slice(0, 10)) }
  }

  async create(
    schoolId: string,
    dto: CreateStaffEvaluationDto,
    userId: string,
    now = new Date(),
  ): Promise<{ evaluation: StaffEvaluationPublic }> {
    await this.resolveStaffPerson(schoolId, dto.personId)
    const dueDate = parseIsoDate(dto.dueDate, 'dueDate') as Date
    // An early evaluation is legal: completedDate may precede dueDate and that is
    // NOT an error. There is no cross-field date check here on purpose.
    const completedDate = parseIsoDate(dto.completedDate, 'completedDate') ?? null

    const row = await this.prisma.staffEvaluation.create({
      data: {
        schoolId,
        personId: dto.personId,
        cycleLabel: dto.cycleLabel,
        dueDate,
        completedDate,
        evaluatorName: dto.evaluatorName ?? null,
        status: dto.status ?? 'scheduled',
        notes: dto.notes ?? null,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
      include: PERSON_INCLUDE,
    })
    // The audit entry carries the row id and NOTHING about the person — an audit log
    // is read by more people than the register is.
    await this.audit.write({
      schoolId,
      userId,
      action: 'hr.staff_evaluation.created',
      targetType: 'staff_evaluations',
      targetId: row.id,
    })
    return { evaluation: this.toPublic(row, now.toISOString().slice(0, 10)) }
  }

  async update(
    schoolId: string,
    evaluationId: string,
    dto: UpdateStaffEvaluationDto,
    userId: string,
    now = new Date(),
  ): Promise<{ evaluation: StaffEvaluationPublic }> {
    const existing = await this.resolveEvaluation(schoolId, evaluationId)
    // 400, not 500: see rejectNullOnRequired. These three have no null form.
    rejectNullOnRequired(dto as Record<string, unknown>, ['cycleLabel', 'dueDate', 'status'])
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const dueDate = parseIsoDate(dto.dueDate, 'dueDate')
    const completedDate = parseIsoDate(dto.completedDate, 'completedDate')

    const row = await this.prisma.staffEvaluation.update({
      where: { id: existing.id },
      data: {
        // personId is NEVER updatable — the DTO does not carry it and
        // forbidNonWhitelisted 400s a stray one before this line is reached.
        cycleLabel: pick(dto.cycleLabel, existing.cycleLabel),
        // dueDate is NOT NULL: `null` is not reachable through the DTO, and an
        // omitted key keeps the current date.
        dueDate: pick(dueDate, existing.dueDate) as Date,
        completedDate: pick(completedDate, existing.completedDate),
        evaluatorName: pick(dto.evaluatorName, existing.evaluatorName),
        status: pick(dto.status, existing.status),
        notes: pick(dto.notes, existing.notes),
        updatedByUserId: userId,
        // createdByUserId is NEVER overwritten (provenance).
      },
      include: PERSON_INCLUDE,
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'hr.staff_evaluation.updated',
      targetType: 'staff_evaluations',
      targetId: row.id,
    })
    return { evaluation: this.toPublic(row, now.toISOString().slice(0, 10)) }
  }

  async remove(
    schoolId: string,
    evaluationId: string,
    userId: string,
  ): Promise<{ id: string }> {
    const existing = await this.resolveEvaluation(schoolId, evaluationId)
    await this.prisma.staffEvaluation.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'hr.staff_evaluation.deleted',
      targetType: 'staff_evaluations',
      targetId: existing.id,
    })
    return { id: existing.id }
  }
}
