import { tableBytes } from '../common/upload-bytes.js'
// ─────────────────────────────────────────────────────────────────────────────
// Record imports (#51): every module with an Add-data step takes a FILE —
// maintenance items, gifts & pledges, campaigns, accreditation standards (a
// staff list rides the governance people import with the staff group).
//
// One shape for all of them, the student/governance imports' shape: the file
// is read ONCE for a stateless preview (how each column was read, what each
// row will do), and the commit takes the reviewed rows back as JSON and writes
// through the module's own service — so the rules the forms enforce (dates,
// enums, audit rows) are the rules the import gets. Merge only: a matched
// record is updated with what the file knows; nothing is ever removed.
// ─────────────────────────────────────────────────────────────────────────────
import { BadRequestException, Injectable } from '@nestjs/common'
import {
  campaignsFromSheet,
  giftsFromSheet,
  mainSheet,
  maintenanceFromSheet,
  readTable,
  standardsFromSheet,
  CAMPAIGN_FIELDS,
  GIFT_FIELDS,
  MAINTENANCE_FIELDS,
  STANDARD_FIELDS,
  type ColumnOverride,
  type FieldSpec,
  type TableSheet,
} from '@finrep/ingestion'
import { importTable, type ImportTable } from '../common/import-mapping.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { FacilitiesService } from '../facilities/facilities.service.js'
import { AdvancementService } from '../advancement/advancement.service.js'
import { AccreditationService } from '../accreditation/accreditation.service.js'
import { isoDateFromText } from '../governance/governance-import.service.js'
import type { CreateMaintenanceDto } from '../facilities/dto/create-maintenance.dto.js'
import type { CreateCampaignDto } from '../advancement/dto/create-campaign.dto.js'
import type { CreateStandardDto } from '../accreditation/dto/create-standard.dto.js'
import type { GiftImportRowDto } from './dto/record-imports.dto.js'

export type ImportTarget = 'maintenance' | 'gifts' | 'campaigns' | 'standards'

export interface ImportPreviewRow<T> {
  row: number
  action: 'new' | 'update' | 'skipped'
  existingId: string | null
  record: T
  issues: string[]
}

export interface ImportPreview<T> {
  target: ImportTarget
  columns: Array<{ field: string; header: string }>
  summary: { new: number; update: number; skipped: number }
  warnings: string[]
  rows: ImportPreviewRow<T>[]
  table: ImportTable
  problem: string | null
}

export interface ImportResult {
  created: number
  updated: number
  skipped: number
  total: number
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

@Injectable()
export class RecordImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly facilities: FacilitiesService,
    private readonly advancement: AdvancementService,
    private readonly accreditation: AccreditationService,
  ) {}

  // ── Preview ─────────────────────────────────────────────────────────────────

  async preview(
    schoolId: string,
    target: ImportTarget,
    file: { buffer: Buffer } | undefined,
    mapping: ColumnOverride | null = null,
  ): Promise<ImportPreview<unknown>> {
    file = await tableBytes(file) // #52
    const { sheet, warnings } = this.sheet(file)
    const NEEDS: Record<ImportTarget, string> = {
      maintenance: 'an item column',
      gifts: 'an amount column (a donor and a date make a row importable)',
      campaigns: 'a campaign name column',
      standards: 'a standard column (the text of each standard or indicator)',
    }
    const FIELDS: Record<ImportTarget, readonly FieldSpec[]> = {
      maintenance: MAINTENANCE_FIELDS,
      gifts: GIFT_FIELDS,
      campaigns: CAMPAIGN_FIELDS,
      standards: STANDARD_FIELDS,
    }
    const problemResult = (read: { columns: { matches: Array<{ key: string; header: string }>; mapping: Record<string, number> }; problem: string | null }) =>
      this.result(target, read.columns.matches, FIELDS[target], warnings, [], importTable(sheet, FIELDS[target], read.columns as never, NEEDS[target]), read.problem)
    switch (target) {
      case 'maintenance': {
        const read = maintenanceFromSheet(sheet, mapping)
        if (read.problem) return problemResult(read)
        const existing = await this.prisma.maintenanceItem.findMany({ where: { schoolId }, select: { id: true, title: true, location: true } })
        const byKey = new Map(existing.map((e) => [`${norm(e.title)}|${norm(e.location)}`, e.id]))
        const rows = read.records.map((r) => {
          const issues: string[] = []
          const targetDate = isoDateFromText(r.targetDate)
          if (targetDate === undefined) issues.push(`row ${r.row}: couldn’t read the date “${r.targetDate}”`)
          const record: CreateMaintenanceDto = {
            title: r.title,
            ...(r.location ? { location: r.location } : {}),
            ...(r.category ? { category: r.category } : {}),
            ...(r.priority ? { priority: r.priority } : {}),
            ...(r.status ? { status: r.status } : {}),
            ...(r.estimatedCost != null ? { estimatedCost: r.estimatedCost } : {}),
            ...(r.actualCost != null ? { actualCost: r.actualCost } : {}),
            ...(r.vendor ? { vendor: r.vendor } : {}),
            ...(targetDate ? { targetDate } : {}),
            ...(r.recurrence ? { recurrence: r.recurrence } : {}),
            ...(r.notes || r.lastDate ? { notes: [r.notes, r.lastDate ? `Last done: ${r.lastDate}` : ''].filter(Boolean).join(' — ') } : {}),
          }
          const existingId = byKey.get(`${norm(r.title)}|${norm(r.location)}`) ?? null
          return this.row(r.row, record, existingId, issues)
        })
        return this.result('maintenance', read.columns.matches, MAINTENANCE_FIELDS, warnings, rows, importTable(sheet, MAINTENANCE_FIELDS, read.columns, NEEDS.maintenance), null)
      }
      case 'gifts': {
        const read = giftsFromSheet(sheet, mapping)
        if (read.problem) return problemResult(read)
        const seen = new Set<string>()
        const rows = read.records.map((r) => {
          const issues: string[] = []
          const occurredOn = isoDateFromText(r.occurredOn)
          if (!occurredOn) issues.push(`row ${r.row}: ${r.occurredOn ? `couldn’t read the date “${r.occurredOn}”` : 'no gift date'}`)
          if (r.amount == null) issues.push(`row ${r.row}: no amount`)
          if (!r.donor) issues.push(`row ${r.row}: no donor`)
          const key = `${norm(r.donor)}|${occurredOn}|${r.amount}`
          if (seen.has(key)) issues.push(`row ${r.row}: the same gift appears earlier in the file`)
          seen.add(key)
          const record: GiftImportRowDto = {
            kind: r.kind,
            amount: r.amount ?? 0,
            ...(r.kind === 'pledge' && r.receivedAmount != null ? { receivedAmount: r.receivedAmount } : {}),
            occurredOn: occurredOn ?? '',
            label: r.donor.slice(0, 120),
            ...(r.note ? { note: r.note } : {}),
            ...(r.source ? { source: r.source } : {}),
            campaign: r.campaign || null,
          }
          return this.row(r.row, record, null, issues)
        })
        return this.result('gifts', read.columns.matches, GIFT_FIELDS, warnings, rows, importTable(sheet, GIFT_FIELDS, read.columns, NEEDS.gifts), null)
      }
      case 'campaigns': {
        const read = campaignsFromSheet(sheet, mapping)
        if (read.problem) return problemResult(read)
        const existing = await this.prisma.advancementCampaign.findMany({ where: { schoolId }, select: { id: true, name: true } })
        const byName = new Map(existing.map((e) => [norm(e.name), e.id]))
        const rows = read.records.map((r) => {
          const issues: string[] = []
          const startDate = isoDateFromText(r.startDate)
          const closeDate = isoDateFromText(r.closeDate)
          if (startDate === undefined) issues.push(`row ${r.row}: couldn’t read the start date “${r.startDate}”`)
          if (closeDate === undefined) issues.push(`row ${r.row}: couldn’t read the end date “${r.closeDate}”`)
          const record: CreateCampaignDto = {
            name: r.name,
            ...(r.campaignType ? { campaignType: r.campaignType } : {}),
            ...(r.goalAmount != null ? { goalAmount: r.goalAmount } : {}),
            ...(r.raisedAmount != null ? { raisedAmount: r.raisedAmount } : {}),
            ...(r.fiscalYear ? { fiscalYear: r.fiscalYear } : {}),
            ...(startDate ? { startDate } : {}),
            ...(closeDate ? { closeDate } : {}),
            ...(r.status ? { status: r.status } : {}),
            ...(r.notes ? { notes: r.notes } : {}),
          }
          return this.row(r.row, record, byName.get(norm(r.name)) ?? null, issues)
        })
        return this.result('campaigns', read.columns.matches, CAMPAIGN_FIELDS, warnings, rows, importTable(sheet, CAMPAIGN_FIELDS, read.columns, NEEDS.campaigns), null)
      }
      case 'standards': {
        const read = standardsFromSheet(sheet, mapping)
        if (read.problem) return problemResult(read)
        const existing = await this.prisma.accreditationStandard.findMany({ where: { schoolId }, select: { id: true, code: true } })
        const byCode = new Map(existing.map((e) => [norm(e.code), e.id]))
        const rows = read.records.map((r) => {
          const issues: string[] = []
          if (!r.code) issues.push(`row ${r.row}: no code — a standard needs one (e.g. 1.2)`)
          if (!r.title) issues.push(`row ${r.row}: no standard text`)
          const reviewDate = isoDateFromText(r.reviewDate)
          if (reviewDate === undefined) issues.push(`row ${r.row}: couldn’t read the review date “${r.reviewDate}”`)
          const record: CreateStandardDto = {
            code: r.code,
            title: r.title,
            ...(r.category ? { category: r.category } : {}),
            ...(r.rating ? { rating: r.rating } : {}),
            ...(r.rubricScore ? { rubricScore: r.rubricScore } : {}),
            ...(reviewDate ? { reviewDate } : {}),
            ...(r.owner ? { owner: r.owner } : {}),
            ...(r.notes ? { notes: r.notes } : {}),
          }
          return this.row(r.row, record, byCode.get(norm(r.code)) ?? null, issues)
        })
        return this.result('standards', read.columns.matches, STANDARD_FIELDS, warnings, rows, importTable(sheet, STANDARD_FIELDS, read.columns, NEEDS.standards), null)
      }
    }
  }

  // ── Commit ──────────────────────────────────────────────────────────────────

  async commitMaintenance(schoolId: string, rows: CreateMaintenanceDto[], userId: string): Promise<ImportResult> {
    const existing = await this.prisma.maintenanceItem.findMany({ where: { schoolId }, select: { id: true, title: true, location: true } })
    const byKey = new Map(existing.map((e) => [`${norm(e.title)}|${norm(e.location)}`, e.id]))
    let created = 0
    let updated = 0
    for (const dto of rows) {
      const key = `${norm(dto.title)}|${norm(dto.location)}`
      const id = byKey.get(key)
      if (id) {
        await this.facilities.updateMaintenance(schoolId, id, dto, userId)
        updated += 1
      } else {
        const row = await this.facilities.createMaintenance(schoolId, dto, userId)
        byKey.set(key, row.id)
        created += 1
      }
    }
    return { created, updated, skipped: 0, total: rows.length }
  }

  /** Every row is a new gift; a campaign named in the file is created when missing. */
  async commitGifts(schoolId: string, rows: GiftImportRowDto[], userId: string): Promise<ImportResult> {
    const existing = await this.prisma.advancementCampaign.findMany({ where: { schoolId }, select: { id: true, name: true } })
    const byName = new Map(existing.map((e) => [norm(e.name), e.id]))
    let created = 0
    let skipped = 0
    for (const { campaign, ...dto } of rows) {
      if (!dto.occurredOn || !(dto.amount > 0)) {
        skipped += 1
        continue
      }
      const name = (campaign || 'Imported gifts').trim()
      let campaignId = byName.get(norm(name))
      if (!campaignId) {
        const c = await this.advancement.createCampaign(schoolId, { name, status: 'active' }, userId)
        campaignId = c.id
        byName.set(norm(name), c.id)
      }
      await this.advancement.createGift(schoolId, campaignId, dto, userId)
      created += 1
    }
    return { created, updated: 0, skipped, total: rows.length }
  }

  async commitCampaigns(schoolId: string, rows: CreateCampaignDto[], userId: string): Promise<ImportResult> {
    const existing = await this.prisma.advancementCampaign.findMany({ where: { schoolId }, select: { id: true, name: true } })
    const byName = new Map(existing.map((e) => [norm(e.name), e.id]))
    let created = 0
    let updated = 0
    for (const dto of rows) {
      const id = byName.get(norm(dto.name))
      if (id) {
        await this.advancement.updateCampaign(schoolId, id, dto, userId)
        updated += 1
      } else {
        const row = await this.advancement.createCampaign(schoolId, dto, userId)
        byName.set(norm(dto.name), row.id)
        created += 1
      }
    }
    return { created, updated, skipped: 0, total: rows.length }
  }

  async commitStandards(schoolId: string, rows: CreateStandardDto[], userId: string): Promise<ImportResult> {
    const existing = await this.prisma.accreditationStandard.findMany({ where: { schoolId }, select: { id: true, code: true } })
    const byCode = new Map(existing.map((e) => [norm(e.code), e.id]))
    let created = 0
    let updated = 0
    let skipped = 0
    for (const dto of rows) {
      if (!dto.code || !dto.title) {
        skipped += 1
        continue
      }
      const id = byCode.get(norm(dto.code))
      if (id) {
        await this.accreditation.updateStandard(schoolId, id, dto, userId)
        updated += 1
      } else {
        const row = await this.accreditation.createStandard(schoolId, dto, userId)
        byCode.set(norm(dto.code), row.id)
        created += 1
      }
    }
    return { created, updated, skipped, total: rows.length }
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private sheet(file: { buffer: Buffer } | undefined): { sheet: TableSheet; warnings: string[] } {
    if (!file?.buffer || file.buffer.length === 0) throw new BadRequestException('No file uploaded.')
    let read
    try {
      read = readTable(file.buffer)
    } catch (e) {
      throw new BadRequestException((e as Error).message)
    }
    const sheet = mainSheet(read)
    if (!sheet) throw new BadRequestException('The file is empty — no header row or rows were found.')
    const warnings: string[] = []
    if (read.sheets.length > 1 && sheet.name) {
      warnings.push(`This workbook has ${read.sheets.length} sheets — we read “${sheet.name}” (the one with the most rows).`)
    }
    return { sheet, warnings }
  }

  private row<T>(row: number, record: T, existingId: string | null, issues: string[]): ImportPreviewRow<T> {
    return { row, action: issues.length ? 'skipped' : existingId ? 'update' : 'new', existingId, record, issues }
  }

  private result<T>(
    target: ImportTarget,
    matches: Array<{ key: string; header: string }>,
    fields: readonly FieldSpec[],
    warnings: string[],
    rows: ImportPreviewRow<T>[],
    table: ImportTable,
    problem: string | null,
  ): ImportPreview<T> {
    const label = (key: string) => fields.find((f) => f.key === key)?.label ?? key
    return {
      target,
      table,
      problem,
      columns: matches.map((m) => ({ field: label(m.key), header: m.header })),
      summary: {
        new: rows.filter((r) => r.action === 'new').length,
        update: rows.filter((r) => r.action === 'update').length,
        skipped: rows.filter((r) => r.action === 'skipped').length,
      },
      warnings,
      rows,
    }
  }
}
