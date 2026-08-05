// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Student roster service. The school's own system of record when no
// SIS is connected. FERPA POSTURE: names live ONLY in the role-gated register
// responses (list/get/create/patch/import preview) over schoolId-scoped routes;
// the /aggregate surface and every snapshot/summary consumer return counts only;
// audit rows carry ids + counts, NEVER names. Hard delete is a true delete.
//
// Coexistence: after EVERY successful roster mutation, syncRosterSnapshot()
// upserts ONE provider:'roster' EnrollmentSnapshot for today and promotes the
// headcount through the EXISTING enrollment promote path (stamp 'roster') — so
// VsPlanKpi, the briefing, analytics v2 and the trend sparkline light up with
// zero consumer changes. An SIS-connected school ('sis' rosterMode) never syncs.
// ─────────────────────────────────────────────────────────────────────────────
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { NormalizedEnrollmentSnapshot, Prisma, Student, User } from '@finrep/db'
import {
  GRADE_KEYS,
  STUDENT_STATUS_KEYS,
  ageBandFromBirthDate,
  ageFromBirthDate,
  type AgeBandKey,
  type StudentFlagKey,
  type StudentStatusKey,
} from '@finrep/analytics'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AuditService } from '../../common/audit/audit.service.js'
import { EnrollmentService } from '../enrollment.service.js'
import { rosterRollup } from './roster-rollup.js'
import { parseStudentImport, type StudentCandidate } from './student-import.parser.js'
import type {
  CreateStudentDto,
  ListStudentsQueryDto,
  StudentFilterQueryDto,
  UpdateStudentDto,
} from './students.dto.js'

/** The register item shape — the ONLY surface (with import preview) carrying names. */
export interface StudentItem {
  id: string
  firstName: string
  lastName: string
  grade: string
  gender: string | null
  race: string | null
  ethnicity: string | null
  birthDate: string | null
  /** DERIVED (never stored): whole-year age / band as of now; null/'unknown' without a birthDate. */
  age: number | null
  ageBand: AgeBandKey
  status: string
  enrolledOn: string | null
  withdrawnOn: string | null
  hasIep: boolean
  has504: boolean
  ell: boolean
  notes: string | null
  externalId: string | null
  createdAt: string
  updatedAt: string
}

export interface StudentListResult {
  items: StudentItem[]
  total: number
  page: number
  pageSize: number
}

/** FERPA-safe aggregation — counts only, no name field exists on this shape. */
export interface StudentAggregate {
  source: 'roster'
  total: number
  filteredTotal: number
  counts: {
    grade: Partial<Record<string, number>>
    status: Record<StudentStatusKey, number>
    gender: Partial<Record<string, number>>
    race: Partial<Record<string, number>>
    ethnicity: Partial<Record<string, number>>
    ageBand: Record<AgeBandKey, number>
    flags: { iep: number; plan504: number; ell: number; any: number }
  }
  kpis: { enrolled: number; waitlist: number; flagged: number; newThisYear: number }
}

export interface ImportPreviewRow {
  action: 'new' | 'update' | 'unchanged' | 'skipped'
  existingId: string | null
  student: StudentCandidate
  issues: string[]
}

/**
 * What the roster→snapshot sync actually DID. Returned (rather than assumed) so a
 * caller can report "this period's enrollment is now N" / "we replaced your entered
 * figure" truthfully instead of guessing from its own inputs.
 */
export interface RosterPromoteResult {
  /** The roster headcount that was promoted (recomputed over EVERY student row). */
  totalEnrolled: number
  promoted: boolean
  superseded: boolean
  supersededManual: number | null
  fiscalPeriodId: string
}

/** Options threaded through the roster→snapshot sync. */
export interface RosterSyncOptions {
  /**
   * The fiscal year the headcount promotes into, CHOSEN on the upload form rather
   * than derived from the as-of date. Absent = today's-date behaviour, unchanged.
   */
  fiscalPeriodId?: string
  /**
   * Opt this sync into the reversible Decision-C supersede of a hand-entered
   * enrollment. DEFAULT FALSE — the auto-sync after a single student edit must
   * never overwrite a head of school's own number.
   */
  supersedeManual?: boolean
  /**
   * The as-of date for the roster snapshot AND the FY period the headcount
   * promotes into. Defaults to today (every existing caller). A roster FILE
   * import passes the file's observedOn so the records, the file snapshot and
   * the promoted headcount all land in the SAME fiscal period — a June file
   * uploaded in August must not count toward next year.
   */
  observedOn?: string
  /**
   * CHUNKED-IMPORT PLUMBING. True on every chunk but the last: the audit row
   * still writes (each one is a true, counts-only record of what that chunk
   * did), but the roster→snapshot promote is DEFERRED to the final chunk — a
   * 6-chunk import must not narrate five wrong intermediate headcounts, and
   * `promote` on the response must describe the finished roster, not a slice.
   */
  skipPromote?: boolean
}

export interface ImportPreviewResult {
  shape: 'oneroster' | 'simple'
  summary: { new: number; update: number; unchanged: number; skipped: number }
  warnings: string[]
  rows: ImportPreviewRow[]
}

const FLAG_FIELD: Record<StudentFlagKey, 'hasIep' | 'has504' | 'ell'> = {
  iep: 'hasIep',
  plan504: 'has504',
  ell: 'ell',
}

const isoDate = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null)
const todayIso = (): string => new Date().toISOString().slice(0, 10)

function subYearsUtc(d: Date, years: number): Date {
  const r = new Date(d)
  r.setUTCFullYear(r.getUTCFullYear() - years)
  return r
}

/** birthDate WHERE for one age band (asOf now). Inclusive edges match
 *  ageBandFromBirthDate — including its future-birthDate → 'unknown' rule
 *  (negative age), so legacy typo'd rows filter and count consistently. */
function birthDateFilterForBand(band: AgeBandKey, asOf: Date): Prisma.StudentWhereInput {
  switch (band) {
    case 'under5':
      return { birthDate: { gt: subYearsUtc(asOf, 5), lte: asOf } }
    case '5to10':
      return { birthDate: { lte: subYearsUtc(asOf, 5), gt: subYearsUtc(asOf, 11) } }
    case '11to13':
      return { birthDate: { lte: subYearsUtc(asOf, 11), gt: subYearsUtc(asOf, 14) } }
    case '14to18':
      return { birthDate: { lte: subYearsUtc(asOf, 14), gt: subYearsUtc(asOf, 19) } }
    case '19plus':
      return { birthDate: { lte: subYearsUtc(asOf, 19) } }
    case 'unknown':
      // No birthDate — or a (legacy) future birthDate, which the aggregate
      // derivation also classifies as 'unknown'.
      return { OR: [{ birthDate: null }, { birthDate: { gt: asOf } }] }
  }
}

/** Jul 1 of the CURRENT fiscal year (FY Jul–Jun) — the `newThisYear` KPI boundary. */
function fyStart(now = new Date()): Date {
  const y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return new Date(Date.UTC(y, 6, 1))
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly enrollment: EnrollmentService,
  ) {}

  // ── Register list + CRUD ─────────────────────────────────────────────────────

  async list(schoolId: string, query: ListStudentsQueryDto): Promise<StudentListResult> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 25
    const sort = query.sort ?? 'lastName'
    const dir = query.dir ?? 'asc'
    const where = this.buildWhere(schoolId, query)

    if (sort === 'grade') {
      // 'grade' is TEXT — DB text order puts '10' before '2', so sort in JS by the
      // canonical GRADE_KEYS index (tiebreak lastName, firstName), then slice.
      const rows = await this.prisma.student.findMany({ where })
      const idx = (g: string) => {
        const i = (GRADE_KEYS as readonly string[]).indexOf(g)
        return i < 0 ? GRADE_KEYS.length : i
      }
      const sign = dir === 'desc' ? -1 : 1
      rows.sort(
        (a, b) =>
          sign * (idx(a.grade) - idx(b.grade)) ||
          a.lastName.localeCompare(b.lastName) ||
          a.firstName.localeCompare(b.firstName),
      )
      const pageRows = rows.slice((page - 1) * pageSize, page * pageSize)
      return { items: pageRows.map((r) => this.toItem(r)), total: rows.length, page, pageSize }
    }

    const [rows, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        orderBy: [{ [sort]: dir }, { lastName: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.student.count({ where }),
    ])
    return { items: rows.map((r) => this.toItem(r)), total, page, pageSize }
  }

  async get(schoolId: string, id: string): Promise<StudentItem> {
    const row = await this.prisma.student.findFirst({ where: { id, schoolId } })
    if (!row) throw new NotFoundException('Student not found.')
    return this.toItem(row)
  }

  async create(actor: User, schoolId: string, dto: CreateStudentDto): Promise<StudentItem> {
    this.assertStatusRule(dto.status ?? 'enrolled', dto.withdrawnOn ?? null)
    this.assertBirthDate(dto.birthDate)
    const row = await this.prisma.student
      .create({ data: this.toCreateData(schoolId, dto, actor.id) })
      .catch((e: unknown) => {
        throw this.mapUniqueError(e)
      })
    // FERPA: ids only, never names.
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'enrollment.student.created',
      targetType: 'students',
      targetId: row.id,
      metadata: { studentId: row.id },
    })
    await this.syncRosterSnapshot(actor, schoolId)
    return this.toItem(row)
  }

  async update(actor: User, schoolId: string, id: string, dto: UpdateStudentDto): Promise<StudentItem> {
    const existing = await this.prisma.student.findFirst({ where: { id, schoolId } })
    if (!existing) throw new NotFoundException('Student not found.')
    const mergedStatus = (dto.status ?? existing.status) as StudentStatusKey
    const mergedWithdrawnOn =
      dto.withdrawnOn !== undefined ? dto.withdrawnOn : isoDate(existing.withdrawnOn)
    this.assertStatusRule(mergedStatus, mergedWithdrawnOn)
    this.assertBirthDate(dto.birthDate)

    const row = await this.prisma.student
      .update({ where: { id: existing.id }, data: this.toUpdateData(dto) })
      .catch((e: unknown) => {
        throw this.mapUniqueError(e)
      })
    // FERPA: ids only, never names.
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'enrollment.student.updated',
      targetType: 'students',
      targetId: row.id,
      metadata: { studentId: row.id, fields: Object.keys(dto) },
    })
    await this.syncRosterSnapshot(actor, schoolId)
    return this.toItem(row)
  }

  /** Hard delete — school data stewardship (no soft-delete PII shadow). */
  async remove(actor: User, schoolId: string, id: string): Promise<{ deleted: boolean }> {
    const existing = await this.prisma.student.findFirst({ where: { id, schoolId } })
    if (!existing) throw new NotFoundException('Student not found.')
    await this.prisma.student.delete({ where: { id: existing.id } })
    // FERPA: ids only, never names.
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'enrollment.student.deleted',
      targetType: 'students',
      targetId: id,
      metadata: { studentId: id },
    })
    await this.syncRosterSnapshot(actor, schoolId)
    return { deleted: true }
  }

  /**
   * CLEAR THE WHOLE REGISTER. The register-level counterpart to remove().
   *
   * Why this exists as its own action: until now the ONLY way to get rid of an
   * imported roster was to upload a replacement file in `replace` mode. A school
   * that imported the wrong file, or a school offboarding a year, had no way to
   * say "this roster should not exist" — the delete was reachable only as a side
   * effect of a different import, which is not a thing anyone thinks to try.
   *
   * `expectedCount` is a WRITTEN-DOWN AGREEMENT, not decoration. The caller sends
   * the number of students it showed the user in the confirm dialog; if the
   * register has since changed (a co-admin's import landed, a sync ran) we refuse
   * rather than delete a different roster than the one that was described. There
   * is no undo for this.
   *
   * The enrollment SNAPSHOT is deliberately left alone. Clearing the register does
   * not unlearn the headcount the school imported — the rollup falls back to the
   * snapshot, so Total enrolled keeps reading 436 while the register reads empty.
   * That is the honest state, and the confirm copy says so out loud.
   *
   * FERPA: counts only in the audit row, never a name.
   */
  async clear(
    actor: User,
    schoolId: string,
    expectedCount: number,
  ): Promise<{ deleted: number }> {
    const actual = await this.prisma.student.count({ where: { schoolId } })
    if (actual !== expectedCount) {
      throw new ConflictException(
        `The roster changed while you were looking at it — it now holds ${actual} student(s), ` +
          `not the ${expectedCount} this action was about to delete. Nothing was deleted. ` +
          'Reload the register and try again.',
      )
    }
    if (actual === 0) return { deleted: 0 }
    const { count } = await this.prisma.student.deleteMany({ where: { schoolId } })
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'enrollment.roster.cleared',
      targetType: 'students',
      targetId: schoolId,
      metadata: { deleted: count },
    })
    // Re-derive the rollup. With no live rows it falls back to the snapshot, which
    // is why the headcount survives a clear.
    await this.syncRosterSnapshot(actor, schoolId)
    return { deleted: count }
  }

  /** All-or-nothing batch create (the Add-students wizard basket, ≤200 rows). */
  async batch(actor: User, schoolId: string, students: CreateStudentDto[]): Promise<{ created: number; ids: string[] }> {
    students.forEach((dto, i) => {
      this.assertStatusRule(dto.status ?? 'enrolled', dto.withdrawnOn ?? null, i)
      this.assertBirthDate(dto.birthDate, i)
    })
    const rows = await this.prisma
      .$transaction(students.map((dto) => this.prisma.student.create({ data: this.toCreateData(schoolId, dto, actor.id) })))
      .catch((e: unknown) => {
        throw this.mapUniqueError(e)
      })
    const ids = rows.map((r) => r.id)
    // FERPA: ids + counts only, never names.
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'enrollment.student.batch_created',
      targetType: 'students',
      metadata: { created: ids.length, ids },
    })
    await this.syncRosterSnapshot(actor, schoolId)
    return { created: ids.length, ids }
  }

  // ── CSV import — stateless preview → commit ──────────────────────────────────

  /** Parse + match ONLY — zero DB writes. The client edits and posts rows back to commit. */
  async importPreview(
    schoolId: string,
    file: { buffer: Buffer; size: number } | undefined,
    demographicsFile?: { buffer: Buffer; size: number },
  ): Promise<ImportPreviewResult> {
    if (!file || !file.buffer || file.size === 0) throw new BadRequestException('No file uploaded.')
    let parsed
    try {
      parsed = parseStudentImport(file.buffer, demographicsFile?.buffer)
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Could not parse the roster CSV.')
    }

    const existing = await this.prisma.student.findMany({ where: { schoolId } })
    const byExternalId = new Map<string, Student>()
    const byNameBirth = new Map<string, Student>()
    for (const s of existing) {
      if (s.externalId) byExternalId.set(s.externalId, s)
      byNameBirth.set(nameBirthKey(s.lastName, s.firstName, isoDate(s.birthDate)), s)
    }

    const summary = { new: 0, update: 0, unchanged: 0, skipped: 0 }
    const rows: ImportPreviewRow[] = parsed.rows.map((r) => {
      if (r.issues.length > 0) {
        summary.skipped++
        return { action: 'skipped' as const, existingId: null, student: r.student, issues: r.issues }
      }
      const match =
        (r.student.externalId ? byExternalId.get(r.student.externalId) : undefined) ??
        byNameBirth.get(nameBirthKey(r.student.lastName, r.student.firstName, r.student.birthDate ?? null))
      if (!match) {
        summary.new++
        return { action: 'new' as const, existingId: null, student: r.student, issues: [] }
      }
      const action = candidateEqualsRow(r.student, match) ? ('unchanged' as const) : ('update' as const)
      summary[action]++
      return { action, existingId: match.id, student: r.student, issues: [] }
    })
    return { shape: parsed.shape, summary, warnings: parsed.warnings, rows }
  }

  /** Commit the previewed/user-edited rows. merge = upsert matching like the
   *  preview (externalId first, then the (lastName, firstName, birthDate)
   *  fallback) else create; replace = swap the whole roster. Transactional. */
  async importCommit(
    actor: User,
    schoolId: string,
    mode: 'merge' | 'replace',
    rows: CreateStudentDto[],
    opts: RosterSyncOptions = {},
  ): Promise<{
    created: number
    updated: number
    deleted: number
    total: number
    /** What the trailing roster sync promoted (absent when it did not run). */
    promote?: RosterPromoteResult
  }> {
    rows.forEach((dto, i) => {
      this.assertStatusRule(dto.status ?? 'enrolled', dto.withdrawnOn ?? null, i)
      this.assertBirthDate(dto.birthDate, i)
    })
    // '' → null already handled in toCreateData; a DUPLICATE externalId inside the
    // payload would trip the unique mid-transaction, so reject it with a clear 400.
    const seen = new Set<string>()
    for (const r of rows) {
      const ext = (r.externalId ?? '').trim()
      if (!ext) continue
      if (seen.has(ext)) throw new BadRequestException(`Duplicate externalId "${ext}" in the import rows.`)
      seen.add(ext)
    }

    let created = 0
    let updated = 0
    let deleted = 0
    if (mode === 'replace') {
      await this.prisma.$transaction(async (tx) => {
        deleted = (await tx.student.deleteMany({ where: { schoolId } })).count
        await tx.student.createMany({ data: rows.map((dto) => this.toCreateData(schoolId, dto, actor.id)) })
        created = rows.length
      })
    } else {
      // Match EXACTLY like the preview: externalId first, then the case-insensitive
      // (lastName, firstName, birthDate) fallback. Without the fallback, every row
      // the preview labelled update/unchanged via name+birth (hand-entered rosters
      // or simple CSVs with no externalId column) would be re-CREATED as a
      // duplicate on each re-import.
      const existing = await this.prisma.student.findMany({
        where: { schoolId },
        select: { id: true, externalId: true, firstName: true, lastName: true, birthDate: true },
      })
      const idByExternal = new Map<string, string>()
      const idByNameBirth = new Map<string, string>()
      for (const e of existing) {
        if (e.externalId) idByExternal.set(e.externalId, e.id)
        idByNameBirth.set(nameBirthKey(e.lastName, e.firstName, isoDate(e.birthDate)), e.id)
      }
      const claimed = new Set<string>() // one payload row per existing student — extras create
      const ops = rows.map((dto) => {
        const ext = (dto.externalId ?? '').trim() || null
        const matchId =
          (ext ? idByExternal.get(ext) : undefined) ??
          idByNameBirth.get(nameBirthKey(dto.lastName, dto.firstName, dto.birthDate ? dto.birthDate.slice(0, 10) : null))
        if (matchId && !claimed.has(matchId)) {
          claimed.add(matchId)
          updated++
          return this.prisma.student.update({ where: { id: matchId }, data: this.toUpdateData(dto) })
        }
        created++
        return this.prisma.student.create({ data: this.toCreateData(schoolId, dto, actor.id) })
      })
      await this.prisma.$transaction(ops).catch((e: unknown) => {
        throw this.mapUniqueError(e)
      })
    }

    const total = await this.prisma.student.count({ where: { schoolId } })
    // FERPA: counts only, never names.
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'enrollment.student.imported',
      targetType: 'students',
      metadata: { mode, created, updated, deleted, total },
    })
    const promote = opts.skipPromote ? null : await this.syncRosterSnapshot(actor, schoolId, opts)
    return { created, updated, deleted, total, ...(promote ? { promote } : {}) }
  }

  // ── FERPA-safe aggregation ───────────────────────────────────────────────────

  /** Counts only — this shape NEVER carries a name (the <5 min-cell mask is a
   *  client display rule; register roles already see rows, so counts stay true). */
  async aggregate(schoolId: string, query: StudentFilterQueryDto): Promise<StudentAggregate> {
    const asOf = new Date()
    const [filtered, all] = await Promise.all([
      this.prisma.student.findMany({
        where: this.buildWhere(schoolId, query),
        select: {
          grade: true,
          status: true,
          gender: true,
          race: true,
          ethnicity: true,
          birthDate: true,
          hasIep: true,
          has504: true,
          ell: true,
        },
      }),
      this.prisma.student.findMany({
        where: { schoolId },
        select: { status: true, hasIep: true, has504: true, ell: true, enrolledOn: true },
      }),
    ])

    const grade: Partial<Record<string, number>> = {}
    const gender: Partial<Record<string, number>> = {}
    const race: Partial<Record<string, number>> = {}
    const ethnicity: Partial<Record<string, number>> = {}
    const status = Object.fromEntries(STUDENT_STATUS_KEYS.map((k) => [k, 0])) as Record<StudentStatusKey, number>
    const ageBand = { under5: 0, '5to10': 0, '11to13': 0, '14to18': 0, '19plus': 0, unknown: 0 } as Record<AgeBandKey, number>
    const flags = { iep: 0, plan504: 0, ell: 0, any: 0 }

    for (const s of filtered) {
      grade[s.grade] = (grade[s.grade] ?? 0) + 1
      if ((STUDENT_STATUS_KEYS as readonly string[]).includes(s.status)) status[s.status as StudentStatusKey]++
      // Null gender/race/ethnicity = "not recorded" → OMITTED (a stored 'unknown' gender DOES count).
      if (s.gender) gender[s.gender] = (gender[s.gender] ?? 0) + 1
      if (s.race) race[s.race] = (race[s.race] ?? 0) + 1
      if (s.ethnicity) ethnicity[s.ethnicity] = (ethnicity[s.ethnicity] ?? 0) + 1
      ageBand[ageBandFromBirthDate(s.birthDate, asOf)]++
      if (s.hasIep) flags.iep++
      if (s.has504) flags.plan504++
      if (s.ell) flags.ell++
      if (s.hasIep || s.has504 || s.ell) flags.any++
    }

    // KPIs are ALWAYS over the UNFILTERED roster (headline tiles stay stable).
    const fyBoundary = fyStart(asOf)
    const kpis = { enrolled: 0, waitlist: 0, flagged: 0, newThisYear: 0 }
    for (const s of all) {
      if (s.status === 'enrolled') {
        kpis.enrolled++
        if (s.hasIep || s.has504 || s.ell) kpis.flagged++
        if (s.enrolledOn && s.enrolledOn >= fyBoundary) kpis.newThisYear++
      } else if (s.status === 'waitlist') {
        kpis.waitlist++
      }
    }

    return {
      source: 'roster',
      total: all.length,
      filteredTotal: filtered.length,
      counts: { grade, status, gender, race, ethnicity, ageBand, flags },
      kpis,
    }
  }

  // ── Roster → snapshot coexistence ───────────────────────────────────────────

  /**
   * AUTO-SYNC after every successful roster mutation: when the school is in
   * 'roster' mode (no SIS source) and has ≥1 student, upsert ONE provider:'roster'
   * snapshot for today and promote through the existing enrollment path (stamp
   * 'roster' — the fill-when-null/own-stamp rule keeps hand-entered manual values
   * safe). When the roster just became EMPTY (last student deleted), a same-day
   * roster snapshot is zeroed out (and re-promoted) so status/VsPlan/briefing
   * don't report a phantom student; prior days' history stays, and a school that
   * never had a roster snapshot today is left untouched.
   * No audit here — the mutation itself was already audited.
   *
   * Returns WHAT IT DID (null when it deliberately did nothing: SIS mode, or an
   * empty roster with no same-day snapshot to zero) so callers report the stored
   * headcount rather than re-deriving one.
   */
  async syncRosterSnapshot(
    actor: User,
    schoolId: string,
    opts: RosterSyncOptions = {},
  ): Promise<RosterPromoteResult | null> {
    const source = await this.prisma.enrollmentSource.findUnique({ where: { schoolId } })
    if (source) return null // 'sis' mode — the SIS always wins
    const when = opts.observedOn ?? todayIso()
    const students = await this.prisma.student.findMany({ where: { schoolId } })
    if (students.length === 0) {
      const stale = await this.prisma.enrollmentSnapshot.findFirst({
        where: { schoolId, provider: 'roster', observedOn: new Date(when) },
        select: { id: true },
      })
      if (stale) return this.upsertRosterSnapshot(actor, schoolId, when, [], opts)
      return null
    }
    return this.upsertRosterSnapshot(actor, schoolId, when, students, opts)
  }

  /** Explicit dated backfill: POST /promote-snapshot { observedOn? }. */
  async promoteSnapshot(
    actor: User,
    schoolId: string,
    observedOn?: string,
  ): Promise<{ promoted: boolean; observedOn: string; totalEnrolled: number }> {
    const source = await this.prisma.enrollmentSource.findUnique({ where: { schoolId } })
    if (source) {
      throw new BadRequestException('An SIS connection is active — snapshots come from the SIS, not the roster.')
    }
    const students = await this.prisma.student.findMany({ where: { schoolId } })
    if (students.length === 0) throw new BadRequestException('The roster is empty — nothing to promote.')
    const when = observedOn ?? todayIso()
    const res = await this.upsertRosterSnapshot(actor, schoolId, when, students)
    // FERPA: counts only, never names.
    await this.audit.write({
      schoolId,
      userId: actor.id,
      action: 'enrollment.roster.promoted',
      targetType: 'enrollment_snapshots',
      metadata: { observedOn: when, totalEnrolled: res.totalEnrolled },
    })
    return { promoted: true, observedOn: when, totalEnrolled: res.totalEnrolled }
  }

  /**
   * Upsert the ONE per-day roster snapshot. Keyed by (schoolId, provider:'roster',
   * observedOn) via findFirst→update/create — NOT a Prisma upsert: the snapshot
   * unique is (schoolId, sourceId, observedOn) with sourceId NULL here (NULLs are
   * distinct in PG), and keying by provider avoids clobbering a same-day 'manual'
   * snapshot. Promote runs first (existing path, quiet) to resolve the FY period.
   */
  private async upsertRosterSnapshot(
    actor: User,
    schoolId: string,
    observedOn: string,
    students: Student[],
    opts: RosterSyncOptions = {},
  ): Promise<RosterPromoteResult> {
    const { totalEnrolled, byGrade, byStatus, byDemographics } = rosterRollup(students)

    const normalized: NormalizedEnrollmentSnapshot = {
      observedOn,
      provider: 'roster',
      totalEnrolled,
      byGrade,
      byStatus,
      byDemographics,
      fte: null,
      warnings: [],
      raw: { derivedFromRoster: true, studentCount: students.length },
    }

    // Existing promote path (public wrapper): stamps 'roster'; fill-when-null or
    // overwrite-own-stamp only, so a hand-entered manual value is never clobbered.
    const promo = await this.enrollment.promoteRoster(actor, schoolId, normalized, {
      supersedeManual: opts.supersedeManual ?? false,
      // Forwarded, not re-derived: this is the promote that actually runs when an
      // upload creates records, so the chosen year has to reach HERE or the picker
      // is decorative.
      ...(opts.fiscalPeriodId ? { fiscalPeriodId: opts.fiscalPeriodId } : {}),
    })
    const { fiscalPeriodId } = promo

    const observed = new Date(observedOn)
    const data = {
      provider: 'roster' as const,
      totalEnrolled,
      byGrade: byGrade as object,
      byStatus: byStatus as object,
      byDemographics: byDemographics as object,
      fte: null,
      raw: { derivedFromRoster: true, studentCount: students.length } as object,
      fiscalPeriodId,
    }
    const existing = await this.prisma.enrollmentSnapshot.findFirst({
      where: { schoolId, provider: 'roster', observedOn: observed },
    })
    if (existing) {
      await this.prisma.enrollmentSnapshot.update({ where: { id: existing.id }, data })
    } else {
      await this.prisma.enrollmentSnapshot.create({
        data: { schoolId, sourceId: null, observedOn: observed, createdByUserId: actor.id, ...data },
      })
    }
    return {
      totalEnrolled,
      promoted: promo.promoted,
      // `?? ` so a caller that stubs the older two-field promoteRoster shape still
      // reads a definite boolean rather than leaking undefined into the response.
      superseded: promo.superseded ?? false,
      supersededManual: promo.supersededManual ?? null,
      fiscalPeriodId,
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  /** Shared filter → Prisma WHERE (register list + aggregate use the SAME builder). */
  private buildWhere(schoolId: string, q: StudentFilterQueryDto): Prisma.StudentWhereInput {
    const asOf = new Date()
    const and: Prisma.StudentWhereInput[] = []
    if (q.q) {
      and.push({
        OR: [
          { firstName: { contains: q.q, mode: 'insensitive' } },
          { lastName: { contains: q.q, mode: 'insensitive' } },
        ],
      })
    }
    if (q.grade?.length) and.push({ grade: { in: q.grade } })
    if (q.status?.length) and.push({ status: { in: q.status } })
    if (q.race?.length) and.push({ race: { in: q.race } })
    if (q.gender?.length) and.push({ gender: { in: q.gender } })
    if (q.ethnicity?.length) and.push({ ethnicity: { in: q.ethnicity } })
    // Flags: OR semantics (any listed flag true).
    if (q.flags?.length) and.push({ OR: q.flags.map((f) => ({ [FLAG_FIELD[f]]: true })) })
    // Age bands: OR of derived birthDate ranges; 'unknown' → birthDate IS NULL.
    if (q.ageBand?.length) and.push({ OR: q.ageBand.map((b) => birthDateFilterForBand(b, asOf)) })
    return { schoolId, ...(and.length ? { AND: and } : {}) }
  }

  private toItem(row: Student): StudentItem {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      grade: row.grade,
      gender: row.gender,
      race: row.race,
      ethnicity: row.ethnicity,
      birthDate: isoDate(row.birthDate),
      // The clock is INJECTED — @finrep/analytics is purity-guarded (no new Date
      // inside the package), so age at "now" is the impure caller's to supply.
      age: ageFromBirthDate(row.birthDate, new Date()),
      ageBand: ageBandFromBirthDate(row.birthDate, new Date()),
      status: row.status,
      enrolledOn: isoDate(row.enrolledOn),
      withdrawnOn: isoDate(row.withdrawnOn),
      hasIep: row.hasIep,
      has504: row.has504,
      ell: row.ell,
      notes: row.notes,
      externalId: row.externalId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toCreateData(schoolId: string, dto: CreateStudentDto, actorId: string): Prisma.StudentUncheckedCreateInput {
    return {
      schoolId,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      grade: dto.grade,
      gender: dto.gender ?? null,
      race: dto.race ?? null,
      ethnicity: dto.ethnicity ?? null,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      status: dto.status ?? 'enrolled',
      enrolledOn: dto.enrolledOn ? new Date(dto.enrolledOn) : null,
      withdrawnOn: dto.withdrawnOn ? new Date(dto.withdrawnOn) : null,
      hasIep: dto.hasIep ?? false,
      has504: dto.has504 ?? false,
      ell: dto.ell ?? false,
      notes: dto.notes ?? null,
      // '' → null: the (schoolId, externalId) unique must never see blanks.
      externalId: (dto.externalId ?? '').trim() || null,
      createdByUserId: actorId,
    }
  }

  /** PATCH data — only fields PRESENT on the dto are written (undefined = untouched). */
  private toUpdateData(dto: UpdateStudentDto): Prisma.StudentUncheckedUpdateInput {
    const data: Prisma.StudentUncheckedUpdateInput = {}
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim()
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim()
    if (dto.grade !== undefined) data.grade = dto.grade
    if (dto.gender !== undefined) data.gender = dto.gender ?? null
    if (dto.race !== undefined) data.race = dto.race ?? null
    if (dto.ethnicity !== undefined) data.ethnicity = dto.ethnicity ?? null
    if (dto.birthDate !== undefined) data.birthDate = dto.birthDate ? new Date(dto.birthDate) : null
    if (dto.status !== undefined) data.status = dto.status
    if (dto.enrolledOn !== undefined) data.enrolledOn = dto.enrolledOn ? new Date(dto.enrolledOn) : null
    if (dto.withdrawnOn !== undefined) data.withdrawnOn = dto.withdrawnOn ? new Date(dto.withdrawnOn) : null
    if (dto.hasIep !== undefined) data.hasIep = dto.hasIep
    if (dto.has504 !== undefined) data.has504 = dto.has504
    if (dto.ell !== undefined) data.ell = dto.ell
    if (dto.notes !== undefined) data.notes = dto.notes ?? null
    if (dto.externalId !== undefined) data.externalId = (dto.externalId ?? '').trim() || null
    return data
  }

  /** Data-quality rule: a birth date must not be in the future (typo guard —
   *  @IsDateString alone would store it and skew the age-band analytics). */
  private assertBirthDate(birthDate: string | null | undefined, rowIndex?: number): void {
    if (!birthDate) return
    if (new Date(birthDate).getTime() > Date.now()) {
      const at = rowIndex != null ? ` (row ${rowIndex + 1})` : ''
      throw new BadRequestException(`birthDate "${birthDate}" is in the future${at}.`)
    }
  }

  /** Cross-field rule: withdrawnOn set ⇒ status ∈ {withdrawn, graduated}. */
  private assertStatusRule(status: StudentStatusKey, withdrawnOn: string | null, rowIndex?: number): void {
    if (withdrawnOn && status !== 'withdrawn' && status !== 'graduated') {
      const at = rowIndex != null ? ` (row ${rowIndex + 1})` : ''
      throw new BadRequestException(
        `withdrawnOn is set but status is "${status}" — a withdrawal date requires status withdrawn or graduated${at}.`,
      )
    }
  }

  /** Prisma P2002 on (schoolId, externalId) → a clear 409; anything else rethrows. */
  private mapUniqueError(e: unknown): Error {
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
      return new ConflictException('A student with this externalId already exists for this school.')
    }
    return e instanceof Error ? e : new Error(String(e))
  }
}

/** Case-insensitive fallback match key: (lastName, firstName, birthDate). */
function nameBirthKey(lastName: string, firstName: string, birthDate: string | null): string {
  return `${lastName.trim().toLowerCase()}|${firstName.trim().toLowerCase()}|${birthDate ?? ''}`
}

/** Field-wise equality of a normalized candidate vs an existing row (drives
 *  the unchanged/update preview split — mirrors exactly what commit would write). */
function candidateEqualsRow(c: StudentCandidate, row: Student): boolean {
  return (
    c.firstName.trim() === row.firstName &&
    c.lastName.trim() === row.lastName &&
    c.grade === row.grade &&
    (c.gender ?? null) === row.gender &&
    (c.race ?? null) === row.race &&
    (c.ethnicity ?? null) === row.ethnicity &&
    (c.birthDate ?? null) === (row.birthDate ? row.birthDate.toISOString().slice(0, 10) : null) &&
    (c.status ?? 'enrolled') === row.status &&
    (c.enrolledOn ?? null) === (row.enrolledOn ? row.enrolledOn.toISOString().slice(0, 10) : null) &&
    (c.withdrawnOn ?? null) === (row.withdrawnOn ? row.withdrawnOn.toISOString().slice(0, 10) : null) &&
    (c.hasIep ?? false) === row.hasIep &&
    (c.has504 ?? false) === row.has504 &&
    (c.ell ?? false) === row.ell &&
    ((c.notes ?? null) || null) === row.notes &&
    (((c.externalId ?? '').trim() || null) === row.externalId)
  )
}
