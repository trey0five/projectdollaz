import { BadRequestException, Injectable } from '@nestjs/common'
import type { PeriodChecklistItem } from '@finrep/db'
import {
  buildYearEndChecklist,
  FL_SCHOLARSHIP_AUP,
  type ChecklistGroup,
  type ChecklistItem,
  type ChecklistSection,
  type FindingStatus,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import { ComplianceService } from './compliance.service.js'
import type { UpsertChecklistDto } from './dto/upsert-checklist.dto.js'

const CHECKLIST_STATUSES = ['pending', 'done', 'na'] as const
type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number]

/** One merged checklist item returned to the client (definition + saved state + context). */
export interface ChecklistItemPublic {
  id: string
  section: ChecklistSection
  label: string
  guidance: string
  relatedRuleId: string | null
  kind: 'procedure' | 'document'
  // Saved user state.
  status: ChecklistStatus
  notes: string | null
  updatedAt: string | null
  /** READ-ONLY CONTEXT: the live 2A finding status for relatedRuleId (never user state). */
  findingStatus: FindingStatus | null
}

export interface ChecklistGroupPublic {
  section: ChecklistSection
  title: string
  items: ChecklistItemPublic[]
}

export interface ChecklistRollup {
  total: number
  done: number
  na: number
  pending: number
  /** (done + na) / total, rounded; na counts as resolved. */
  pctComplete: number
}

export interface ChecklistResponse {
  periodId: string
  label: string
  rulesetVersion: string
  statuteYear: number
  groups: ChecklistGroupPublic[]
  rollup: ChecklistRollup
}

function normalizeStatus(s: string | null | undefined): ChecklistStatus {
  return (CHECKLIST_STATUSES as readonly string[]).includes(s ?? '')
    ? (s as ChecklistStatus)
    : 'pending'
}

@Injectable()
export class ChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
  ) {}

  /** Flatten the built groups to the set of known item ids (procedures + documents). */
  private knownItemIds(): Set<string> {
    const ids = new Set<string>()
    for (const g of buildYearEndChecklist()) for (const i of g.items) ids.add(i.id)
    return ids
  }

  /**
   * GET — build the pure checklist, merge the saved per-item state (default
   * 'pending'), annotate each procedure item with its LIVE 2A finding status as
   * read-only context, and compute the readiness rollup. Deterministic; two GETs
   * are identical. Tenant-isolated via the ComplianceService (getOwnedPeriod).
   */
  async getChecklist(schoolId: string, periodId: string): Promise<ChecklistResponse> {
    // Reusing the compliance evaluation also enforces tenant isolation + gives the
    // live finding statuses (CONTEXT only) keyed by ruleId.
    const compliance = await this.compliance.evaluateForPeriod(schoolId, periodId)
    const period = { id: compliance.periodId, label: compliance.label }

    const findingStatusByRule = new Map<string, FindingStatus>(
      compliance.findings.map((f) => [f.id, f.status]),
    )

    const groups: ChecklistGroup[] = buildYearEndChecklist()

    const savedRows = await this.prisma.periodChecklistItem.findMany({
      where: { schoolId, fiscalPeriodId: period.id },
    })
    const savedByItem = new Map<string, PeriodChecklistItem>(
      savedRows.map((r) => [r.itemId, r]),
    )

    let total = 0
    let done = 0
    let na = 0
    let pending = 0

    const publicGroups: ChecklistGroupPublic[] = groups.map((g) => ({
      section: g.section,
      title: g.title,
      items: g.items.map((item: ChecklistItem) => {
        const saved = savedByItem.get(item.id) ?? null
        const status = normalizeStatus(saved?.status)
        total += 1
        if (status === 'done') done += 1
        else if (status === 'na') na += 1
        else pending += 1
        return {
          id: item.id,
          section: item.section,
          label: item.label,
          guidance: item.guidance,
          relatedRuleId: item.relatedRuleId ?? null,
          kind: item.kind,
          status,
          notes: saved?.notes ?? null,
          updatedAt: saved ? saved.updatedAt.toISOString() : null,
          findingStatus: item.relatedRuleId
            ? findingStatusByRule.get(item.relatedRuleId) ?? null
            : null,
        }
      }),
    }))

    const rollup: ChecklistRollup = {
      total,
      done,
      na,
      pending,
      pctComplete: total > 0 ? Math.round(((done + na) / total) * 100) : 0,
    }

    return {
      periodId: period.id,
      label: period.label,
      rulesetVersion: FL_SCHOLARSHIP_AUP.version,
      statuteYear: FL_SCHOLARSHIP_AUP.statuteYear,
      groups: publicGroups,
      rollup,
    }
  }

  /**
   * PUT — upsert the editable checklist item state keyed by itemId. Validates each
   * itemId against the built known-id set (unknown -> 400) and the status enum
   * (defence in depth). Merge-pick semantics: an omitted key keeps the existing
   * value, an explicit null clears notes. Audits 'checklist.updated' once, then
   * returns the fresh checklist (recomputed rollup).
   */
  async upsertItems(
    schoolId: string,
    periodId: string,
    dto: UpsertChecklistDto,
    userId: string,
  ): Promise<ChecklistResponse> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const known = this.knownItemIds()

    const pick = <T>(dtoVal: T | undefined, current: T): T =>
      dtoVal === undefined ? current : dtoVal

    for (const e of dto.items) {
      if (!known.has(e.itemId)) {
        throw new BadRequestException(`Unknown item_id: ${e.itemId}.`)
      }
      if (
        e.status !== undefined &&
        !(CHECKLIST_STATUSES as readonly string[]).includes(e.status)
      ) {
        throw new BadRequestException(`Invalid status: ${e.status}.`)
      }

      const existing = await this.prisma.periodChecklistItem.findUnique({
        where: {
          schoolId_fiscalPeriodId_itemId: {
            schoolId,
            fiscalPeriodId: period.id,
            itemId: e.itemId,
          },
        },
      })

      const data = {
        status: pick(e.status, normalizeStatus(existing?.status)),
        notes: pick(e.notes, existing?.notes ?? null),
        updatedByUserId: userId,
      }

      await this.prisma.periodChecklistItem.upsert({
        where: {
          schoolId_fiscalPeriodId_itemId: {
            schoolId,
            fiscalPeriodId: period.id,
            itemId: e.itemId,
          },
        },
        create: { schoolId, fiscalPeriodId: period.id, itemId: e.itemId, ...data },
        update: data,
      })
    }

    await this.audit.write({
      schoolId,
      userId,
      action: 'checklist.updated',
      targetType: 'period_checklist_items',
      metadata: {
        fiscalPeriodId: period.id,
        itemIds: dto.items.map((e) => e.itemId),
      },
    })

    return this.getChecklist(schoolId, period.id)
  }
}
