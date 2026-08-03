import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common'
import type { User } from '@finrep/db'
import { canonicalBulkAdoptPayload } from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { ImprovementService, ADOPT_REUSED } from '../improvement/improvement.service.js'
import { INITIATIVE_AUDIT_TARGET } from '../improvement/improvement.constants.js'
import { sha256hex } from '../common/hash.js'
import { mapWithConcurrency, ORG_FANOUT_CONCURRENCY } from '../common/concurrency.js'
import { PortfolioService } from './portfolio.service.js'
import type { BulkAdoptDto } from './dto/bulk-adopt.dto.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase I §6 — BULK ADOPT. The only write path in the phase.
//
// A superintendent picks one intervention priority ("COG-14 is below the
// improvement threshold at 9 of 14 schools") and pushes it to those schools. Per
// school the service resolves THAT SCHOOL'S OWN AccreditationStandard.id from
// (schoolId, catalogStandardId) and calls the EXISTING Phase-G
// `ImprovementService.adopt`.
//
// ── PHASE G'S IDEMPOTENCY IS THE MECHANISM, NOT A RE-IMPLEMENTATION ──────────
// `adopt` already dedupes on `(originType, originRef)` and returns the existing
// initiative marked with the ADOPT_REUSED symbol. Running the same bulk-adopt
// twice therefore creates nothing the second time. There is deliberately NO second
// dedupe here: two mechanisms for one invariant is how they drift apart, and the
// one that is already in production and already has the unique index behind it is
// the one that should own it.
//
// ── PROPOSE → CONFIRM IS MECHANICAL, NOT A NAMING CONVENTION ─────────────────
// `propose` performs ZERO writes and returns the per-school preview plus a
// `proposalHash`. `confirm` recomputes that hash from the request it was given and
// 409s `PROPOSAL_STALE` unless it matches. The superintendent confirms the list
// they were SHOWN, not a list that changed underneath them. The canonical STRING
// lives in the pure package so the two sides can never disagree about what was
// hashed; the hashing itself lives here, because crypto is I/O-adjacent and does
// not belong in a package with a purity test.
//
// ── ONE AUDIT ROW PER SCHOOL. NO ORG SUMMARY ROW ─────────────────────────────
// "A superintendent pushed something to 14 schools" is not an auditable fact at
// any ONE school, and a school looking through its own history is the reader this
// log exists for. A school that was targeted and REUSED still gets its row: the
// fact that this diocesan action named this school IS the record, even though no
// initiative was created.
// ─────────────────────────────────────────────────────────────────────────────

/** Roles permitted to accept a diocesan push at a school. `viewer` is not one. */
const WRITE_ROLES: ReadonlySet<string> = new Set(['owner', 'accountant'])

/**
 * The origin vocabulary is CLOSED (`improvement.constants.ts`:
 * manual | gap | assurance | finding | draft). A bulk adoption of a standard the
 * school scores below threshold IS a gap adoption, and 'gap' is what dedupes
 * against a single-school adoption of the same standard — which is the behaviour
 * a superintendent wants: pushing to a school that already adopted it must not
 * create a second copy.
 *
 * [DEVIATION] The frozen spec named `originType: 'accreditation_gap'`. No such
 * value exists in IMPROVEMENT_ORIGIN_TYPES; storing it would break the DTO `@IsIn`
 * on every subsequent single-school write against the same row and would silently
 * defeat the very dedupe §6.1 says is "the mechanism, not a re-implementation".
 */
const BULK_ORIGIN_TYPE = 'gap' as const

/** The recommendation template a rubric-gap adoption uses. Phase G's vocabulary. */
const BULK_TEMPLATE_ID = 'REC-RUBRIC-STEP'

/**
 * TWO VOCABULARIES, AND THE TENSE IS THE POINT.
 *
 * PREVIEW says what WOULD happen: `will_create` / `already_adopted`. CONFIRM says
 * what DID: `created` / `reused` / `failed`. Reusing the preview words after the
 * write means the one screen whose job is to state what was actually done reads
 * "Will create an initiative" under the heading "Applied" — future tense for a
 * completed write, with a pending-toned pill. A superintendent's only reasonable
 * reading of that is that the push did not land, and the natural response is to
 * click Confirm again.
 */
export type BulkAdoptStatus =
  // preview
  | 'will_create'
  | 'already_adopted'
  // applied
  | 'created'
  | 'reused'
  | 'failed'
  // skipped, in either mode
  | 'no_standard'
  | 'not_licensed'
  | 'forbidden'

export interface BulkAdoptPreviewRow {
  schoolId: string
  name: string
  standardId: string | null
  existingInitiativeId: string | null
  willCreate: boolean
  status: BulkAdoptStatus
}

export interface BulkAdoptAppliedRow extends BulkAdoptPreviewRow {
  initiativeId: string | null
  reused: boolean
  applied: boolean
  /** Present ONLY on a row whose write threw. The reason, carried to the screen. */
  failureMessage?: string
}

@Injectable()
export class PortfolioBulkAdoptService {
  private readonly logger = new Logger(PortfolioBulkAdoptService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly improvement: ImprovementService,
    private readonly portfolio: PortfolioService,
  ) {}

  async bulkAdopt(user: User, orgId: string, dto: BulkAdoptDto) {
    const generatedAt = new Date().toISOString()
    const scope = await this.portfolio.resolveOrgScope(user, orgId)

    // Requested schools, de-duplicated and ordered — the hash is over a SORTED
    // list, so a client reordering its array cannot invalidate its own proposal.
    const requested = [...new Set(dto.schoolIds)].sort()

    // ── AUTHORIZATION FOR THE WHOLE BATCH, BEFORE THE FIRST WRITE ────────────
    // A viewer at ONE target school 403s the entire call and NOTHING is written.
    // Checking inside the fan-out loop would leave a half-applied diocesan push
    // behind, which is worse than either outcome: some schools now carry work the
    // superintendent was told they could not push. The memberships were already
    // fetched by resolveOrgScope — this costs no query.
    const outsideOrg = requested.filter((id) => !scope.roleBySchool.has(id))
    if (outsideOrg.length > 0) {
      throw new ForbiddenException({
        code: 'SCHOOL_NOT_IN_ORGANIZATION',
        message: `School ${outsideOrg[0]} is not in this organization.`,
        schoolId: outsideOrg[0],
      })
    }
    const readOnly = requested.filter((id) => !WRITE_ROLES.has(scope.roleBySchool.get(id) as string))
    if (readOnly.length > 0) {
      const school = scope.schools.find((s) => s.id === readOnly[0])
      throw new ForbiddenException({
        code: 'READ_ONLY_AT_SCHOOL',
        message: `You have read-only access at ${school?.name ?? readOnly[0]}, so this cannot be pushed there.`,
        schoolId: readOnly[0],
      })
    }

    const licensed = await this.portfolio.resolveLicensed(requested)

    // ── THE PREVIEW. Two bounded reads, no fan-out. ──────────────────────────
    const standards = await this.prisma.accreditationStandard.findMany({
      where: { schoolId: { in: requested }, catalogStandardId: dto.catalogStandardId },
      select: { id: true, schoolId: true },
      orderBy: [{ schoolId: 'asc' }, { id: 'asc' }],
    })
    const standardBySchool = new Map(standards.map((s) => [s.schoolId, s.id]))

    const existing = await this.prisma.improvementInitiative.findMany({
      where: {
        schoolId: { in: requested },
        originType: BULK_ORIGIN_TYPE,
        originRef: { in: [...standardBySchool.values()] },
      },
      select: { id: true, schoolId: true, originRef: true },
      orderBy: [{ schoolId: 'asc' }, { id: 'asc' }],
    })
    const existingBySchool = new Map(existing.map((e) => [e.schoolId, e.id]))

    const nameOf = new Map(scope.schools.map((s) => [s.id, s.name]))
    const preview: BulkAdoptPreviewRow[] = requested.map((schoolId) => {
      const name = nameOf.get(schoolId) ?? schoolId
      if (!licensed.has(schoolId)) {
        return {
          schoolId,
          name,
          standardId: null,
          existingInitiativeId: null,
          willCreate: false,
          status: 'not_licensed',
        }
      }
      const standardId = standardBySchool.get(schoolId) ?? null
      if (!standardId) {
        // A school with no clone of that catalog standard is SKIPPED and said to be
        // skipped — never handed a fabricated standard so the batch looks complete.
        return {
          schoolId,
          name,
          standardId: null,
          existingInitiativeId: null,
          willCreate: false,
          status: 'no_standard',
        }
      }
      const existingInitiativeId = existingBySchool.get(schoolId) ?? null
      return {
        schoolId,
        name,
        standardId,
        existingInitiativeId,
        willCreate: existingInitiativeId === null,
        status: existingInitiativeId ? 'already_adopted' : 'will_create',
      }
    })

    // The hash covers WHAT WOULD BE WRITTEN, not what was displayed alongside it.
    const proposalHash = sha256hex(
      canonicalBulkAdoptPayload({
        orgId,
        catalogStandardId: dto.catalogStandardId,
        schoolIds: requested,
        title: dto.title,
        dueDate: dto.dueDate ?? null,
        targetRubricScore: dto.targetRubricScore ?? null,
      }),
    )

    if (dto.mode === 'propose') {
      return {
        orgId,
        generatedAt,
        mode: 'propose' as const,
        catalogStandardId: dto.catalogStandardId,
        title: dto.title,
        proposalHash,
        schoolCount: requested.length,
        willCreateCount: preview.filter((p) => p.willCreate).length,
        schools: preview,
      }
    }

    // ── CONFIRM ──────────────────────────────────────────────────────────────
    if (dto.proposalHash !== proposalHash) {
      throw new ConflictException({
        code: 'PROPOSAL_STALE',
        message:
          'This proposal no longer matches the request. Review the schools again before confirming.',
      })
    }

    const actionable = preview.filter((p) => p.standardId !== null)

    // Adopt is a WRITE path. Sixty unbounded parallel writes is the same
    // connection-pool cliff this phase exists to fix, wearing a different hat.
    const settled = await mapWithConcurrency(actionable, ORG_FANOUT_CONCURRENCY, async (row) => {
      const result = (await this.improvement.adopt(
        row.schoolId,
        {
          templateId: BULK_TEMPLATE_ID,
          originType: BULK_ORIGIN_TYPE,
          originRef: row.standardId as string,
          title: dto.title,
          dueDate: dto.dueDate ?? null,
          targetRubricScore: dto.targetRubricScore ?? null,
        },
        user.id,
      )) as { id: string } & Record<symbol, unknown>
      return { row, id: result.id, reused: result[ADOPT_REUSED] === true }
    })

    const applied: BulkAdoptAppliedRow[] = []
    const failures: { schoolId: string; message: string }[] = []

    for (let i = 0; i < settled.length; i += 1) {
      const res = settled[i]
      const row = actionable[i]
      if (res.status === 'rejected') {
        failures.push({ schoolId: row.schoolId, message: String(res.reason) })
        this.logger.warn(`bulk adopt failed at school ${row.schoolId}: ${String(res.reason)}`)
        // NOT the preview status. A school where the adopt threw must not come
        // back wearing the same word as a school where it succeeded.
        applied.push({
          ...row,
          initiativeId: null,
          reused: false,
          applied: false,
          status: 'failed',
          failureMessage: String(res.reason),
        })
        continue
      }
      applied.push({
        ...row,
        initiativeId: res.value.id,
        reused: res.value.reused,
        applied: true,
        status: res.value.reused ? 'reused' : 'created',
      })
    }

    // ── EXACTLY ONE AUDIT ROW PER SCHOOL THE SERVICE ACTED ON ────────────────
    // Created OR reused. Skipped schools (no_standard / not_licensed / forbidden)
    // get none and are reported in the response instead. The
    // `strategy.initiative.created` row Phase G writes for a genuine creation is
    // UNCHANGED and ADDITIONAL — that is Phase G's trail, not ours.
    const acted = applied.filter((a) => a.applied && a.initiativeId)
    for (const a of acted) {
      await this.audit.write({
        organizationId: orgId,
        schoolId: a.schoolId,
        userId: user.id,
        action: 'improvement.bulk_adopt.applied',
        targetType: INITIATIVE_AUDIT_TARGET,
        targetId: a.initiativeId,
        metadata: {
          catalogStandardId: dto.catalogStandardId,
          proposalHash,
          reused: a.reused,
          schoolCount: requested.length,
        },
      })
    }

    return {
      orgId,
      generatedAt,
      mode: 'confirm' as const,
      catalogStandardId: dto.catalogStandardId,
      title: dto.title,
      proposalHash,
      schoolCount: requested.length,
      createdCount: acted.filter((a) => !a.reused).length,
      reusedCount: acted.filter((a) => a.reused).length,
      skippedCount: preview.length - actionable.length,
      failedCount: failures.length,
      failures,
      // ONE ROW TYPE ACROSS THE WHOLE ARRAY. The skipped rows are annotated
      // rather than left as an inferred literal, so `schools` is
      // `BulkAdoptAppliedRow[]` and not a union — a caller (or a spec) reading
      // `applied` / `failureMessage` is then reading the contract, not narrowing
      // its way past an accident of inference.
      schools: [
        ...applied,
        ...preview
          .filter((p) => p.standardId === null)
          .map(
            (p): BulkAdoptAppliedRow => ({
              ...p,
              initiativeId: null,
              reused: false,
              applied: false,
            }),
          ),
      ].sort((a, b) => (a.schoolId < b.schoolId ? -1 : a.schoolId > b.schoolId ? 1 : 0)),
    }
  }
}
