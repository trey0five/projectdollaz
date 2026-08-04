// ─────────────────────────────────────────────────────────────────────────────
// ONE upload, the whole job: a OneRoster export that carries per-student detail
// now creates the STUDENT RECORDS *and* promotes the headcount into
// PeriodOperationalData.enrollment — the field eleven finance metrics read.
//
// Why this is its own service and not a method on either neighbour: StudentsService
// imports EnrollmentService, so EnrollmentService can never import StudentsService
// (the ESM cycle that roster-rollup.ts already exists to avoid). The orchestration
// therefore lives here, injecting both, imported by nothing but EnrollmentController.
//
// THE ONE-WRITER RULE. Two paths can promote a headcount and they must never both
// run for a single upload, or the dashboard prints whichever finished last:
//
//   wroteRecords && rosterMode  →  the ROSTER promotes (recomputed over every
//                                  student row the register now holds, stamp
//                                  'roster'), and the file snapshot is written
//                                  for history with promote SUPPRESSED.
//   otherwise                   →  today's behaviour, unchanged: the FILE promotes
//                                  its own totalEnrolled with the file's stamp.
//
// The roster total, not the file total, because summary() and demographics()
// already prefer live Student rows in roster mode: promoting the file's number
// while the register holds a different one would print two headcounts from a
// single upload. The number reported in the response is the number stored.
//
// THREE RULES THIS SERVICE ENFORCES ON TOP OF THAT, each answering a way the
// first cut could still end with the user worse off than before they uploaded:
//
//   ZERO IS NOT A HEADCOUNT.   A file that counts nobody (header-only, grade
//     codes outside the map, teachers-only, every row tobedeleted) says nothing
//     about enrollment. It never promotes and never supersedes: `0` is a
//     legitimate value to the metric layer, so storing one turns "not entered"
//     into a confident −100%.
//   DEGRADE, DON'T FAIL.       A repeated sourcedId is dropped with an aggregate
//     warning rather than 400-ing the whole upload at the register importer.
//   …EXCEPT WHERE FAILING IS THE SAFE OPTION. `replace` deletes the register and
//     re-creates only the rows we could read, so a row we cannot read is a
//     student the file NAMES being deleted. With no preview on this path, that
//     one refuses before the delete.
//
// FERPA: this service reads names only to hand them to StudentsService, and its
// response — like every warning it emits — carries counts and grade buckets only.
// ─────────────────────────────────────────────────────────────────────────────
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { NormalizedEnrollmentSnapshot, User } from '@finrep/db'
import type { GradeKey } from '@finrep/analytics'
import {
  parseOneRosterCsv,
  parseOneRosterStudents,
  type OneRosterStudentRow,
} from '@finrep/ingestion/oneroster'
import { gradeKeyFromLabel, isWithdrawnStatus } from './enrollment.normalize.js'
import type { EnrollmentIntakeResult } from './enrollment.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import {
  EnrollmentService,
  looksLikeZip,
  wrapCsvAsZip,
  type UploadedRosterFile,
} from './enrollment.service.js'
import { StudentsService } from './students/students.service.js'
import { STUDENT_IMPORT_MAX_ROWS, type CreateStudentDto } from './students/students.dto.js'

/**
 * What a LIVE SYNC produced. The intake result the route already returned, plus
 * the same two record-reporting fields the upload response carries — so the two
 * doors into the roster describe their outcome in one vocabulary.
 *
 * FERPA: counts and aggregate notes only. No field here can hold a student name.
 */
export interface SyncResult extends EnrollmentIntakeResult {
  /** null ⇔ no per-student detail was importable (counts-only provider, or over the ceiling). */
  records: { created: number; updated: number; deleted: number; total: number } | null
  /** Why `records` is null, in the user's words. Server-authored, never guessed at in JSX. */
  recordsNote: string | null
  /** Aggregate skip reasons. Never a name. */
  recordWarnings: string[]
}

export interface RosterUploadResult {
  // ── byte-compatible with the EnrollmentIntakeResult this route returned before ──
  /** What the FILE said — the by-grade chart and the audit trail. */
  snapshot: { observedOn: string; totalEnrolled: number; byGrade: Partial<Record<GradeKey, number>> }
  /** Did THIS call write periodOperationalData.enrollment. */
  promoted: boolean
  superseded?: boolean
  supersededManual?: number | null
  warnings: string[]
  /**
   * Why `promoted` is false, in the user's words. SERVER-AUTHORED on purpose: the
   * web fallback for an undiagnosable refusal is deliberately causeless, so any
   * cause we DO know has to be sent, not guessed at in a JSX ternary.
   */
  reason?: string

  // ── additive ──
  /** null ⇔ no per-student detail was importable (counts-only file, or over the ceiling). */
  records: { created: number; updated: number; deleted: number; total: number } | null
  /**
   * Why `records` is null, in the user's words — again server-authored. The panel
   * used to guess ("the notes below say why") off the mere presence of a warning,
   * which pointed at an unrelated grade-code note whenever one existed.
   */
  recordsNote: string | null
  /**
   * What was STORED. null ⇔ nothing was promoted. May legitimately differ from
   * `snapshot.totalEnrolled` when merging into a school that already had students
   * the file does not mention.
   *
   * `periodLabel` names the fiscal year that was WRITTEN. A June file uploaded in
   * August lands in the year it describes, which is not the year on the user's
   * screen — "this period's enrollment is now 436" then reads as a claim about a
   * period that did not change.
   */
  enrollment: {
    value: number
    source: 'roster' | 'file'
    fiscalPeriodId: string
    periodLabel: string | null
    /**
     * Does the period we just wrote into hold a trial balance?
     *
     * WHY THIS IS ON THE SERVER AND NOT INFERRED IN THE UI. The honest question a
     * head of school has is not "which fiscal year is on my screen" — it is "did
     * this change my numbers". Those differ: the as-of date defaults to TODAY and
     * the fiscal year runs Jul-Jun, so an August upload is filed under the NEXT
     * year, which routinely has no ledger yet. Verified on real data: 436 students
     * landed in FY 2027 while every finance metric sat in FY 2026 and kept
     * computing from a hand-entered 1200 — cost per pupil $8,683 against 1200
     * versus $23,899 against 436. Not a rounding difference; a different answer.
     *
     * I first tried to detect this by comparing against the period label in the
     * WIZARD's context, and it was INERT: that screen resolves no period, so the
     * warning never rendered in the one place it was needed. The server always
     * knows, from every entry point, with no prop threading.
     *
     * false = the roster is stored and correct, and no finance metric moved.
     */
    periodHasFinancials: boolean
  } | null
}

export interface RosterUploadOptions {
  observedOn?: string
  /** The fiscal year chosen on the form; absent falls back to the date-derived one. */
  fiscalPeriodId?: string
  mode?: 'merge' | 'replace'
}

@Injectable()
export class RosterUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollment: EnrollmentService,
    private readonly students: StudentsService,
  ) {}

  /**
   * LIVE SYNC, with student records.
   *
   * The connected-source counterpart of upload(), and the fix for a gap that was
   * invisible because it looked like a feature: sync() has always written a
   * headcount and never a single student row, so a school that connected its SIS
   * got "436 enrolled" on the Enrollment page and a permanently EMPTY register —
   * no records to edit, and Waitlist / Support flags / New this year dashed
   * forever. The adapters were already fetching people; the snapshot builder threw
   * them away one line later.
   *
   * MERGE, ALWAYS — never replace. An upload is a person deliberately choosing a
   * file and a mode. A sync can be triggered by a schedule or a reconnect, and
   * `replace` deletes every student the register holds; a hand-entered pupil the
   * SIS does not know about must not vanish because a sync ran. The cost is that a
   * pupil REMOVED from the SIS lingers until someone removes them here, which is
   * the recoverable failure of the two.
   *
   * A provider that returns no identity keeps today's behaviour exactly: counts
   * land, `records` is null, and the note says why.
   */
  /**
   * Write the receipt. Best-effort ON PURPOSE: a failure to record WHAT happened
   * must never fail the intake that already happened. The roster is in the
   * database by the time this runs; throwing here would report an error for a
   * successful import and invite the user to upload it a second time.
   */
  private async recordIntake(
    schoolId: string,
    actorId: string | null,
    data: {
      kind: 'upload' | 'sync'
      provider?: string | null
      fileName?: string | null
      observedOn?: string | null
      totalCounted: number
      records: { created: number; updated: number; deleted: number } | null
      recordsNote: string | null
      warnings: string[]
    },
  ): Promise<void> {
    try {
      await this.prisma.enrollmentImport.create({
        data: {
          schoolId,
          kind: data.kind,
          provider: data.provider ?? null,
          fileName: data.fileName ?? null,
          observedOn: data.observedOn ? new Date(data.observedOn) : null,
          totalCounted: data.totalCounted,
          recordsCreated: data.records?.created ?? 0,
          recordsUpdated: data.records?.updated ?? 0,
          recordsDeleted: data.records?.deleted ?? 0,
          recordsNote: data.recordsNote,
          warnings: data.warnings,
          uploadedByUserId: actorId,
        },
      })
    } catch {
      /* the intake succeeded; the receipt is not worth failing it for */
    }
  }

  /** The intake receipts for a school, newest first. FERPA: counts only. */
  async listImports(schoolId: string, limit = 10) {
    return this.prisma.enrollmentImport.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  /**
   * Delete ONE receipt. This removes the RECORD OF an import, not the students it
   * created — those live in the register and are removed there. Said plainly in
   * the UI, because "delete import" reading as "delete the students" is exactly
   * the kind of ambiguity that loses a school's roster.
   */
  async removeImport(schoolId: string, importId: string): Promise<{ deleted: boolean }> {
    const existing = await this.prisma.enrollmentImport.findFirst({
      where: { id: importId, schoolId },
    })
    if (!existing) throw new NotFoundException('Import not found.')
    await this.prisma.enrollmentImport.delete({ where: { id: existing.id } })
    return { deleted: true }
  }

  async sync(
    actor: User,
    schoolId: string,
    asOf?: string,
  ): Promise<SyncResult> {
    const { intake, rows } = await this.enrollment.syncAndIntake(actor, schoolId, asOf)

    // Only rows the register can actually store. The filter is the SAME shape the
    // upload path applies, and for the same reasons — but the counters stay
    // aggregate: a sync report is read in a browser and pasted into tickets, so no
    // provider row may contribute a NAME to a warning.
    const candidates: CreateStudentDto[] = []
    let missingName = 0
    let unmappedGrade = 0
    let duplicateId = 0
    const seenExternalIds = new Set<string>()
    for (const r of rows) {
      const firstName = (r.firstName ?? '').trim()
      const lastName = (r.lastName ?? '').trim()
      if (!firstName || !lastName) {
        missingName++
        continue
      }
      const grade = gradeKeyFromLabel(r.grade)
      if (grade === null) {
        unmappedGrade++
        continue
      }
      const externalId = (r.externalId ?? '').trim()
      if (externalId) {
        if (seenExternalIds.has(externalId)) {
          duplicateId++
          continue
        }
        seenExternalIds.add(externalId)
      }
      candidates.push({
        firstName,
        lastName,
        grade,
        status: isWithdrawnStatus(r.status) ? 'withdrawn' : 'enrolled',
        ...(externalId ? { externalId } : {}),
        ...(r.birthDate ? { birthDate: r.birthDate } : {}),
      })
    }

    const warnings: string[] = []
    if (unmappedGrade > 0) {
      warnings.push(`${unmappedGrade} row(s) skipped: unmapped grade — no student record was created for them.`)
    }
    if (missingName > 0) {
      warnings.push(`${missingName} row(s) skipped: the provider returned no name for them.`)
    }
    if (duplicateId > 0) {
      warnings.push(`${duplicateId} row(s) skipped: the same student id appears earlier in the provider response.`)
    }

    let records: SyncResult['records'] = null
    let recordsNote: string | null = null

    if (rows.length === 0) {
      recordsNote =
        'This provider returned totals only — a headcount by grade, with no per-student rows to save.'
    } else if (candidates.length > STUDENT_IMPORT_MAX_ROWS) {
      // The ceiling degrades to counts-only rather than failing, exactly as the
      // upload path does: a large school must not lose the sync that works for it.
      recordsNote =
        `This provider returned ${candidates.length} students, above the ${STUDENT_IMPORT_MAX_ROWS}-row limit for ` +
        'one import, so the headcount was synced but the student records were not.'
      warnings.push(recordsNote)
    } else if (candidates.length > 0) {
      const commit = await this.students.importCommit(actor, schoolId, 'merge', candidates, {
        // A sync is NOT a deliberate dated act by a person, so it must not
        // supersede a figure someone typed. That is the upload path's Decision 2,
        // and the distinction is the whole reason it is a decision.
        supersedeManual: false,
      })
      records = {
        created: commit.created,
        updated: commit.updated,
        deleted: commit.deleted,
        total: commit.total,
      }
    } else {
      recordsNote = `None of the ${rows.length} rows this provider returned could be saved as a student record — the notes below say why.`
    }

    await this.recordIntake(schoolId, actor.id, {
      kind: 'sync',
      // The snapshot view the intake returns carries no provider field; the
      // connected source is the authority on which provider ran.
      provider: (await this.prisma.enrollmentSource.findUnique({ where: { schoolId } }))?.provider ?? null,
      observedOn: intake.snapshot?.observedOn ?? null,
      totalCounted: intake.snapshot?.totalEnrolled ?? 0,
      records,
      recordsNote,
      warnings,
    })

    return { ...intake, records, recordsNote, recordWarnings: warnings }
  }

  async upload(
    actor: User,
    schoolId: string,
    file: UploadedRosterFile | undefined,
    opts: RosterUploadOptions = {},
  ): Promise<RosterUploadResult> {
    // 1 — the same file guard and the same two normalizing helpers as before.
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('No file uploaded.')
    }
    const zip = looksLikeZip(file.buffer) ? file.buffer : wrapCsvAsZip(file.buffer)
    const parseOpts = opts.observedOn ? { observedOn: opts.observedOn } : undefined

    // 2 — the AGGREGATE parse runs first, so a structurally unusable file still
    // fails once, with today's message.
    let normalized: NormalizedEnrollmentSnapshot
    try {
      normalized = parseOneRosterCsv(zip, parseOpts)
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Could not parse the OneRoster export.')
    }
    const warnings = [...(normalized.warnings ?? [])]

    // 3 — per-student rows are OPTIONAL. A users.csv with no name columns returns
    // [] and this upload behaves exactly as it always has: counts, no records, no
    // error. The catch is belt-and-braces for the same reason — a school whose
    // export we cannot read row-wise must not lose the counts path that works.
    let rows: OneRosterStudentRow[]
    let recordsNote: string | null = null
    try {
      rows = parseOneRosterStudents(zip, parseOpts)
    } catch {
      rows = []
      warnings.push(
        'Per-student rows could not be read from this file — enrollment was counted but records were not created.',
      )
      recordsNote =
        'We could not read the per-student rows out of this file, so only the headcount was saved.'
    }
    if (rows.length === 0 && recordsNote === null) {
      // The legitimate counts-only export (no givenName/familyName columns at all).
      // Said HERE rather than inferred in the browser: the panel used to print this
      // sentence only when the warning list happened to be empty, so a file that
      // was counts-only AND had an odd grade code got "the notes below say why"
      // pointing at notes that said nothing about it.
      recordsNote =
        'It carried totals only — a headcount by grade, with no per-student rows to save.'
    }

    // 4 — candidates. Only what a users.csv actually knows; every other student
    // field is OMITTED (not nulled) so toUpdateData leaves demographics a school
    // entered by hand untouched on a re-upload. Warnings are AGGREGATE counts —
    // they are rendered in a browser and pasted into support tickets, so a name
    // must never appear in one.
    const candidates: CreateStudentDto[] = []
    let missingName = 0
    let unmappedGrade = 0
    let duplicateId = 0
    const seenExternalIds = new Set<string>()
    for (const r of rows) {
      const firstName = r.givenName.trim()
      const lastName = r.familyName.trim()
      if (!firstName || !lastName) {
        missingName++
        continue
      }
      if (r.grade === null) {
        unmappedGrade++
        continue
      }
      const externalId = (r.sourcedId ?? '').trim()
      // A repeated sourcedId — a re-enrolled pupil emitted twice, merged sibling
      // records — used to reach StudentsService.importCommit, which rejects it with
      // a 400 BEFORE any write. One messy row then cost the whole upload: no
      // records, no snapshot, no counts, no warning. Drop the later occurrence
      // here instead and say so in aggregate, so the rest of the file still lands.
      // (The register importer's own guard stays: it protects its other callers.)
      if (externalId) {
        if (seenExternalIds.has(externalId)) {
          duplicateId++
          continue
        }
        seenExternalIds.add(externalId)
      }
      candidates.push({
        firstName,
        lastName,
        grade: r.grade,
        status: r.withdrawn ? 'withdrawn' : 'enrolled',
        ...(externalId ? { externalId } : {}),
      })
    }
    if (unmappedGrade > 0) {
      warnings.push(`${unmappedGrade} row(s) skipped: unmapped grade — no student record was created for them.`)
    }
    if (missingName > 0) {
      warnings.push(`${missingName} row(s) skipped: missing name.`)
    }
    if (duplicateId > 0) {
      warnings.push(`${duplicateId} row(s) skipped: the same student id appears earlier in the file.`)
    }
    const unreadableRows = missingName + unmappedGrade + duplicateId

    // 4b — REPLACE + unreadable rows = silent data loss. Replace deletes the whole
    // register and re-creates only the rows we could read, so a student the file
    // NAMES but we cannot import disappears — while the card promises "only the
    // students in this file survive". There is no preview on this path to catch it,
    // so refuse BEFORE the delete and name the safe routes. Merge is unaffected.
    if ((opts.mode ?? 'merge') === 'replace' && unreadableRows > 0) {
      throw new BadRequestException(
        `Replace was not applied: ${unreadableRows} row(s) in this file could not be read ` +
          '(unmapped grade, missing name, or a repeated student id), and replacing would delete ' +
          'every current student while keeping only the rows we can read — so students this file ' +
          'names would be lost. Upload again with Merge, or use the import with a review step to ' +
          'see and fix those rows first.',
      )
    }

    // 5/6 — the ceiling degrades to counts-only rather than failing: a 3,000-student
    // school must not lose the path that works for it today.
    let records: RosterUploadResult['records'] = null
    let rosterPromote: Awaited<ReturnType<StudentsService['importCommit']>>['promote']

    // A file that counts NOBODY says nothing about enrollment — it is not the
    // number 0. Every way of getting to a zero headcount is a file we failed to
    // read (a header-only export, grade codes outside the map, a teachers-only
    // export, every row tobedeleted), and `0` is a legitimate value to the metric
    // layer: it makes enrollment_change_yoy a confident -100% and blanks four
    // per-pupil metrics. So a zero parse must never supersede a hand-entered
    // figure, and (below) must not promote at all.
    const fileCountsStudents =
      normalized.totalEnrolled > 0 || candidates.some((c) => c.status !== 'withdrawn')

    if (candidates.length > STUDENT_IMPORT_MAX_ROWS) {
      warnings.push(
        `This file has ${candidates.length} students, above the ${STUDENT_IMPORT_MAX_ROWS}-row import ceiling — ` +
          'enrollment was counted but records were not created.',
      )
      recordsNote =
        `This file lists ${candidates.length} students, above the ${STUDENT_IMPORT_MAX_ROWS}-row limit for one ` +
        'import, so the headcount was saved but the student records were not. Split it into files of ' +
        `${STUDENT_IMPORT_MAX_ROWS} or fewer — by grade band, say — and upload them one after another; ` +
        'merge adds each file to the same register.'
    } else if (candidates.length > 0) {
      // The register's OWN importer does the writes: one matching dialect
      // (sourcedId → externalId, then name+birthDate, then create), one set of
      // validation rules, one audit row. A BadRequest/Conflict from it — a
      // duplicate sourcedId in the file, say — propagates unchanged.
      const commit = await this.students.importCommit(
        actor,
        schoolId,
        opts.mode ?? 'merge',
        candidates,
        // DECISION 2: an explicit upload is a deliberate, dated act by an
        // owner/accountant, so it SUPERSEDES a hand-entered figure — reversibly
        // (the value is backed up once and `revertManual` restores it) and out
        // loud (the response says so). The background sync after a single student
        // edit still refuses; that default is untouched.
        //
        // …but ONLY when the file actually counted somebody. Superseding a
        // hand-entered 436 with a 0 nobody typed is exactly the failure Decision 2
        // was written to avoid, in the other direction.
        {
          supersedeManual: fileCountsStudents,
          observedOn: normalized.observedOn,
          // THE CHOSEN YEAR REACHES THE PROMOTE THAT ACTUALLY RUNS. When records
          // land, the ROSTER promotes rather than the file — so passing the year
          // only to intakeNormalized left the picker inert for precisely the
          // uploads it exists for. Verified before the fix: an upload sent
          // explicitly at FY 2026 still landed in FY 2027.
          ...(opts.fiscalPeriodId ? { fiscalPeriodId: opts.fiscalPeriodId } : {}),
        },
      )
      records = {
        created: commit.created,
        updated: commit.updated,
        deleted: commit.deleted,
        total: commit.total,
      }
      rosterPromote = commit.promote
      // Records were created, so there is nothing to explain away.
      recordsNote = null
    } else if (rows.length > 0) {
      // Rows were read but NONE survived the candidate filter (all skipped for an
      // unmapped grade / missing name / repeated id). That has its own cause, and
      // it is the warnings — which now genuinely say why, one aggregate line each.
      recordsNote = `None of the ${rows.length} rows in this file could be saved as a student record — the notes below say why.`
    }

    // 7 — who owns the promote. `rosterPromote != null` is part of the condition,
    // not decoration: it is the proof that the roster path ACTUALLY promoted. If it
    // did not (an SIS row appeared between the write and this read), the file path
    // still promotes and the upload cannot silently end with nothing stored.
    const wroteRecords = !!records && records.created + records.updated > 0
    const rosterMode = (await this.prisma.enrollmentSource.findUnique({ where: { schoolId } })) === null
    const rosterOwnsPromote = wroteRecords && rosterMode && rosterPromote != null

    // The FILE promotes only when it counted somebody. `promote: false` still
    // writes the snapshot and the enrollment.imported audit row, so the file and
    // its (empty) grade breakdown are kept for history — nothing is lost, and the
    // period's enrollment is simply not spoken for by a file that says nothing.
    const filePromotes = !rosterOwnsPromote && normalized.totalEnrolled > 0

    const intake = await this.enrollment.intakeNormalized(actor, schoolId, normalized, {
      sourceId: null,
      promote: filePromotes,
      supersedeManual: true,
      // The year the uploader CHOSE, when they chose one. Threaded through rather
      // than re-derived, so the snapshot, the promote and the response all name the
      // same period — the thing that was silently not true when the date alone
      // decided it.
      ...(opts.fiscalPeriodId ? { fiscalPeriodId: opts.fiscalPeriodId } : {}),
    })

    // 8 — report the single writer that ran. Never recompute a number for display.
    const writer = rosterOwnsPromote
      ? {
          promoted: rosterPromote!.promoted,
          superseded: rosterPromote!.superseded,
          supersededManual: rosterPromote!.supersededManual,
          value: rosterPromote!.totalEnrolled,
          fiscalPeriodId: rosterPromote!.fiscalPeriodId,
          source: 'roster' as const,
        }
      : {
          promoted: intake.promoted,
          superseded: intake.superseded ?? false,
          supersededManual: intake.supersededManual ?? null,
          value: normalized.totalEnrolled,
          fiscalPeriodId: intake.fiscalPeriodId,
          source: 'file' as const,
        }

    // 9 — when nothing was promoted, say why IF we know. The one cause this
    // service can diagnose is the one it just enforced: a file that counted
    // nobody, whether it was stopped before the promote (file path) or refused by
    // the manual guard it deliberately did not override (roster path).
    const reason = writer.promoted
      ? undefined
      : fileCountsStudents
        ? undefined
        : 'No students in this file were counted as enrolled, so this period’s enrollment was left exactly as it was. ' +
          'The file and its grade breakdown were saved. Check the grade codes and the status column, then upload again.'

    await this.recordIntake(schoolId, actor.id, {
      kind: 'upload',
      fileName: file.originalname ?? null,
      observedOn: intake.snapshot?.observedOn ?? null,
      totalCounted: intake.snapshot?.totalEnrolled ?? 0,
      records,
      recordsNote: records ? null : recordsNote,
      warnings,
    })

    return {
      snapshot: intake.snapshot,
      promoted: writer.promoted,
      superseded: writer.superseded,
      supersededManual: writer.supersededManual,
      warnings,
      ...(reason ? { reason } : {}),
      records,
      recordsNote: records ? null : recordsNote,
      enrollment: writer.promoted
        ? {
            value: writer.value,
            source: writer.source,
            fiscalPeriodId: writer.fiscalPeriodId,
            periodLabel: await this.periodLabel(writer.fiscalPeriodId),
            periodHasFinancials: await this.periodHasFinancials(writer.fiscalPeriodId),
          }
        : null,
    }
  }

  /**
   * The fiscal year's own label ("FY2026"), so the panel can name the period it
   * wrote instead of saying "this period" — which the reader takes to mean the
   * period on their screen. A June file uploaded in August writes the year it
   * describes, not the one they are looking at. Best-effort: a missing label
   * degrades to the old wording rather than failing an upload that succeeded.
   */
  /**
   * Fail-SOFT and fail-OPTIMISTIC: an unreadable check returns true, so a blip in
   * this lookup can never manufacture the alarming "no finance metric changed"
   * sentence for a school whose numbers did in fact move. Silence is the safe
   * default here; a false alarm is not.
   */
  private async periodHasFinancials(fiscalPeriodId: string): Promise<boolean> {
    try {
      // StatementSnapshot is the row `periods.hasSnapshot` is derived from — the
      // same signal report-schedule and the assistant use to mean "this period has
      // financials". Named explicitly rather than reaching for a TrialBalance*
      // model, which does not exist under that name.
      const snap = await this.prisma.statementSnapshot.findFirst({
        where: { fiscalPeriodId },
        select: { id: true },
      })
      return snap !== null
    } catch {
      return true
    }
  }

  private async periodLabel(fiscalPeriodId: string): Promise<string | null> {
    try {
      const period = await this.prisma.fiscalPeriod.findUnique({
        where: { id: fiscalPeriodId },
        select: { label: true },
      })
      return period?.label ?? null
    } catch {
      return null
    }
  }
}
