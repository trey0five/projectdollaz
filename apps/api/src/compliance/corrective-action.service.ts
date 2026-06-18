import { BadRequestException, Injectable } from '@nestjs/common'
import type { PeriodCorrectiveAction } from '@finrep/db'
import {
  scaffoldCorrectiveActionPlan,
  RULE_BY_ID,
  SECTION_ORDER,
  FL_SCHOLARSHIP_AUP,
  type CapScaffoldEntry,
  type Section,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { ComplianceService } from './compliance.service.js'
import type { UpsertCorrectiveActionDto } from './dto/upsert-corrective-action.dto.js'

const CAP_STATUSES = ['open', 'in_progress', 'complete'] as const
type CapStatus = (typeof CAP_STATUSES)[number]

/** One merged CAP entry returned to the client. */
export interface CapEntryPublic {
  ruleId: string
  section: Section
  title: string
  citation: string
  severity: 'material' | 'reportable'
  /** Live finding detail (or, for a resolved row, a note that it self-healed). */
  observation: string
  suggestedRootCause: string
  suggestedCorrectiveAction: string
  suggestedResponsibleParty: string
  suggestedTimeframe: string
  // Saved editable fields (null when the user has not filled them).
  rootCause: string | null
  correctiveAction: string | null
  responsibleParty: string | null
  targetDate: string | null
  status: CapStatus
  /** True when the underlying finding is no longer material/reportable (stale). */
  isResolved: boolean
  /** Non-null when a user dismissed this resolved row (soft-archived). */
  archivedAt: string | null
  updatedAt: string | null
}

export interface CorrectiveActionPlanResponse {
  periodId: string
  label: string
  rulesetVersion: string
  statuteYear: number
  entries: CapEntryPublic[]
  /** Resolved rows the user dismissed (soft-archived) — kept for restore/audit. */
  archived: CapEntryPublic[]
  summary: {
    materialCount: number
    reportableCount: number
    openCount: number
    inProgressCount: number
    completeCount: number
    /** Saved rows whose finding self-healed (excluded from the status counts). */
    resolvedCount: number
    /** Dismissed (archived) resolved rows. */
    archivedCount: number
  }
}

function sectionIndex(section: Section): number {
  const i = SECTION_ORDER.indexOf(section)
  return i === -1 ? SECTION_ORDER.length : i
}

/** Serialize a DB Date (@db.Date) to yyyy-mm-dd with no timezone drift. */
function toIsoDate(d: Date | null): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

function normalizeStatus(s: string | null | undefined): CapStatus {
  return (CAP_STATUSES as readonly string[]).includes(s ?? '')
    ? (s as CapStatus)
    : 'open'
}

@Injectable()
export class CorrectiveActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
  ) {}

  /**
   * GET — recompute the live 2A findings, run the pure scaffold, and MERGE the
   * saved editable rows. Saved non-null fields win; suggested* always come from the
   * scaffold (UI prefill). A saved row whose finding is no longer material/
   * reportable is emitted with isResolved:true (never deleted). Deterministic — two
   * GETs are identical. Tenant-isolated via the ComplianceService (getOwnedPeriod).
   */
  async getPlan(schoolId: string, periodId: string): Promise<CorrectiveActionPlanResponse> {
    const compliance = await this.compliance.evaluateForPeriod(schoolId, periodId)
    const period = { id: compliance.periodId, label: compliance.label }

    const scaffold = scaffoldCorrectiveActionPlan(compliance.findings, {
      includeReportable: true,
    })
    const scaffoldByRule = new Map<string, CapScaffoldEntry>(
      scaffold.map((e) => [e.ruleId, e]),
    )

    const savedRows = await this.prisma.periodCorrectiveAction.findMany({
      where: { schoolId, fiscalPeriodId: period.id },
    })
    const savedByRule = new Map<string, PeriodCorrectiveAction>(
      savedRows.map((r) => [r.ruleId, r]),
    )

    const entries: CapEntryPublic[] = []

    // 1) Live scaffolded entries (material/reportable findings), scaffold order.
    for (const entry of scaffold) {
      const saved = savedByRule.get(entry.ruleId) ?? null
      entries.push({
        ruleId: entry.ruleId,
        section: entry.section,
        title: entry.title,
        citation: entry.citation,
        severity: entry.severity,
        observation: entry.observation,
        suggestedRootCause: entry.suggestedRootCause,
        suggestedCorrectiveAction: entry.suggestedCorrectiveAction,
        suggestedResponsibleParty: entry.suggestedResponsibleParty,
        suggestedTimeframe: entry.suggestedTimeframe,
        rootCause: saved?.rootCause ?? null,
        correctiveAction: saved?.correctiveAction ?? null,
        responsibleParty: saved?.responsibleParty ?? null,
        targetDate: toIsoDate(saved?.targetDate ?? null),
        status: normalizeStatus(saved?.status),
        isResolved: false,
        archivedAt: saved?.archivedAt ? saved.archivedAt.toISOString() : null,
        updatedAt: saved ? saved.updatedAt.toISOString() : null,
      })
    }

    // 2) Saved rows whose finding is no longer scaffolded -> resolved/stale.
    //    A user-dismissed (archivedAt) row is split out into `archived` so it stops
    //    cluttering the active resolved list but stays restorable.
    const resolved: CapEntryPublic[] = []
    const archived: CapEntryPublic[] = []
    for (const saved of savedRows) {
      if (scaffoldByRule.has(saved.ruleId)) continue
      const rule = RULE_BY_ID[saved.ruleId]
      // The card is dimmed/resolved and excluded from the summary, so label it by
      // the rule's own intent. Only 'material' severityOnFail rules carry the
      // 'material' label; everything else (reportable/gate/info/watch, or an
      // unknown ruleId) labels as the lower-alarm 'reportable' rather than
      // defaulting to 'material'.
      const severity: 'material' | 'reportable' =
        rule?.severityOnFail === 'material' ? 'material' : 'reportable'
      const row: CapEntryPublic = {
        ruleId: saved.ruleId,
        section: (rule?.section ?? 'ELIGIBILITY') as Section,
        title: rule?.title ?? saved.ruleId,
        citation: rule?.citation ?? '',
        severity,
        observation:
          saved.observation ??
          'This finding is no longer flagged material/reportable for the current inputs.',
        suggestedRootCause: '',
        suggestedCorrectiveAction: '',
        suggestedResponsibleParty: '',
        suggestedTimeframe: '',
        rootCause: saved.rootCause ?? null,
        correctiveAction: saved.correctiveAction ?? null,
        responsibleParty: saved.responsibleParty ?? null,
        targetDate: toIsoDate(saved.targetDate),
        status: normalizeStatus(saved.status),
        isResolved: true,
        archivedAt: saved.archivedAt ? saved.archivedAt.toISOString() : null,
        updatedAt: saved.updatedAt.toISOString(),
      }
      ;(saved.archivedAt ? archived : resolved).push(row)
    }
    const bySection = (a: CapEntryPublic, b: CapEntryPublic) => {
      const s = sectionIndex(a.section) - sectionIndex(b.section)
      return s !== 0 ? s : a.ruleId.localeCompare(b.ruleId)
    }
    resolved.sort(bySection)
    archived.sort(bySection)
    entries.push(...resolved)

    // Summary over the NON-resolved (live) entries for severity, all for status.
    const live = entries.filter((e) => !e.isResolved)
    const summary = {
      materialCount: live.filter((e) => e.severity === 'material').length,
      reportableCount: live.filter((e) => e.severity === 'reportable').length,
      openCount: live.filter((e) => e.status === 'open').length,
      inProgressCount: live.filter((e) => e.status === 'in_progress').length,
      completeCount: live.filter((e) => e.status === 'complete').length,
      resolvedCount: entries.length - live.length,
      archivedCount: archived.length,
    }

    return {
      periodId: period.id,
      label: period.label,
      rulesetVersion: FL_SCHOLARSHIP_AUP.version,
      statuteYear: FL_SCHOLARSHIP_AUP.statuteYear,
      entries,
      archived,
      summary,
    }
  }

  /**
   * Dismiss (soft-archive) or restore a resolved CAP row by ruleId. Archiving sets
   * archivedAt so the row drops out of the active resolved list but is kept for
   * audit/restore; restoring clears it. owner/accountant only. Returns the fresh plan.
   */
  async setArchived(
    schoolId: string,
    periodId: string,
    ruleId: string,
    archived: boolean,
    userId: string,
  ): Promise<CorrectiveActionPlanResponse> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    if (!RULE_BY_ID[ruleId]) {
      throw new BadRequestException(`Unknown ruleId: ${ruleId}.`)
    }
    const existing = await this.prisma.periodCorrectiveAction.findUnique({
      where: {
        schoolId_fiscalPeriodId_ruleId: { schoolId, fiscalPeriodId: period.id, ruleId },
      },
    })
    if (!existing) {
      throw new BadRequestException(`No saved corrective-action row for ruleId: ${ruleId}.`)
    }

    await this.prisma.periodCorrectiveAction.update({
      where: {
        schoolId_fiscalPeriodId_ruleId: { schoolId, fiscalPeriodId: period.id, ruleId },
      },
      data: { archivedAt: archived ? new Date() : null, updatedByUserId: userId },
    })

    await this.audit.write({
      schoolId,
      userId,
      action: archived ? 'cap.archived' : 'cap.restored',
      targetType: 'period_corrective_actions',
      metadata: { fiscalPeriodId: period.id, ruleId },
    })

    return this.getPlan(schoolId, period.id)
  }

  /**
   * PUT — upsert the editable CAP rows keyed by ruleId. Merge-pick semantics like
   * compliance-inputs.upsert: an explicit null clears, an omitted key keeps the
   * existing value. Re-validates status (defence in depth) and the targetDate.
   * Audits 'cap.updated' once, then returns the fresh merged plan.
   */
  async upsertEntries(
    schoolId: string,
    periodId: string,
    dto: UpsertCorrectiveActionDto,
    userId: string,
  ): Promise<CorrectiveActionPlanResponse> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)

    const pick = <T>(dtoVal: T | undefined, current: T): T =>
      dtoVal === undefined ? current : dtoVal

    for (const e of dto.entries) {
      // Constrain to REAL ruleIds so the editable set stays aligned with the AUP
      // ruleset and clients cannot persist junk/orphan CAP rows.
      if (!RULE_BY_ID[e.ruleId]) {
        throw new BadRequestException(`Unknown ruleId: ${e.ruleId}.`)
      }
      if (e.status !== undefined && !(CAP_STATUSES as readonly string[]).includes(e.status)) {
        throw new BadRequestException(`Invalid status: ${e.status}.`)
      }
      let targetDate: Date | null | undefined
      if (e.targetDate !== undefined) {
        if (e.targetDate === null) {
          targetDate = null
        } else {
          const d = new Date(`${e.targetDate.slice(0, 10)}T00:00:00.000Z`)
          if (Number.isNaN(d.getTime())) {
            throw new BadRequestException(`Invalid targetDate: ${e.targetDate}.`)
          }
          targetDate = d
        }
      }

      const existing = await this.prisma.periodCorrectiveAction.findUnique({
        where: {
          schoolId_fiscalPeriodId_ruleId: {
            schoolId,
            fiscalPeriodId: period.id,
            ruleId: e.ruleId,
          },
        },
      })

      const data = {
        observation: pick(e.observation, existing?.observation ?? null),
        rootCause: pick(e.rootCause, existing?.rootCause ?? null),
        correctiveAction: pick(e.correctiveAction, existing?.correctiveAction ?? null),
        responsibleParty: pick(e.responsibleParty, existing?.responsibleParty ?? null),
        targetDate: pick(targetDate, existing?.targetDate ?? null),
        status: pick(e.status, normalizeStatus(existing?.status)),
        updatedByUserId: userId,
      }

      await this.prisma.periodCorrectiveAction.upsert({
        where: {
          schoolId_fiscalPeriodId_ruleId: {
            schoolId,
            fiscalPeriodId: period.id,
            ruleId: e.ruleId,
          },
        },
        create: { schoolId, fiscalPeriodId: period.id, ruleId: e.ruleId, ...data },
        update: data,
      })
    }

    await this.audit.write({
      schoolId,
      userId,
      action: 'cap.updated',
      targetType: 'period_corrective_actions',
      metadata: {
        fiscalPeriodId: period.id,
        ruleIds: dto.entries.map((e) => e.ruleId),
      },
    })

    return this.getPlan(schoolId, period.id)
  }
}
