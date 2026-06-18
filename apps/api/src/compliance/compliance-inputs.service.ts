import { BadRequestException, Injectable } from '@nestjs/common'
import type { PeriodComplianceInputs, Prisma } from '@finrep/db'
import type { ComplianceInputs, Program } from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { PeriodsService } from '../periods/periods.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { UpsertComplianceInputsDto } from './dto/upsert-compliance-inputs.dto.js'

const VALID_PROGRAMS: Program[] = ['FTC', 'FES_EO', 'FES_UA']

/** Public, JSON-safe shape returned to the client (Decimal -> number). */
export interface ComplianceInputsPublic {
  scholarshipFundsReceived: number | null
  programs: Program[]
  fundsAtInsuredInstitution: boolean | null
  avgDailyBalanceOver250k: boolean | null
  bankRatingReviewedTopTwo: boolean | null
  reconciledWithin60Days: boolean | null
  reconciliationIndependentlyReviewed: boolean | null
  doeStatusApproved: boolean | null
  yearsInOperation: number | null
  suretyBondPosted: boolean | null
  fesuaAnyAccountOver50k: boolean | null
  notes: string | null
  updatedAt: string | null
}

function dec(v: Prisma.Decimal | null): number | null {
  return v === null ? null : Number(v)
}

/** Keep only valid program tiers, in the canonical order, de-duplicated. */
function sanitizePrograms(programs: string[] | null | undefined): Program[] {
  if (!programs) return []
  const set = new Set(programs)
  return VALID_PROGRAMS.filter((p) => set.has(p))
}

@Injectable()
export class ComplianceInputsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly audit: AuditService,
  ) {}

  private toPublic(row: PeriodComplianceInputs | null): ComplianceInputsPublic {
    if (!row) {
      return {
        scholarshipFundsReceived: null,
        programs: [],
        fundsAtInsuredInstitution: null,
        avgDailyBalanceOver250k: null,
        bankRatingReviewedTopTwo: null,
        reconciledWithin60Days: null,
        reconciliationIndependentlyReviewed: null,
        doeStatusApproved: null,
        yearsInOperation: null,
        suretyBondPosted: null,
        fesuaAnyAccountOver50k: null,
        notes: null,
        updatedAt: null,
      }
    }
    return {
      scholarshipFundsReceived: dec(row.scholarshipFundsReceived),
      programs: sanitizePrograms(row.programs),
      fundsAtInsuredInstitution: row.fundsAtInsuredInstitution,
      avgDailyBalanceOver250k: row.avgDailyBalanceOver250k,
      bankRatingReviewedTopTwo: row.bankRatingReviewedTopTwo,
      reconciledWithin60Days: row.reconciledWithin60Days,
      reconciliationIndependentlyReviewed: row.reconciliationIndependentlyReviewed,
      doeStatusApproved: row.doeStatusApproved,
      yearsInOperation: row.yearsInOperation,
      suretyBondPosted: row.suretyBondPosted,
      fesuaAnyAccountOver50k: row.fesuaAnyAccountOver50k,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private async findRow(
    schoolId: string,
    fiscalPeriodId: string,
  ): Promise<PeriodComplianceInputs | null> {
    return this.prisma.periodComplianceInputs.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } },
    })
  }

  /**
   * The intake for one period as the pure compliance shape (Decimal -> number,
   * programs as Program[]). Returns an all-undefined shape when no row exists so
   * the pure package returns needs_data for intake rules. No tenant check here —
   * the caller (ComplianceService) has already resolved the owned period.
   */
  async complianceInputsFor(
    schoolId: string,
    fiscalPeriodId: string,
  ): Promise<ComplianceInputs> {
    const row = await this.findRow(schoolId, fiscalPeriodId)
    if (!row) return { programs: [] }
    return {
      scholarshipFundsReceived: dec(row.scholarshipFundsReceived),
      programs: sanitizePrograms(row.programs),
      fundsAtInsuredInstitution: row.fundsAtInsuredInstitution,
      avgDailyBalanceOver250k: row.avgDailyBalanceOver250k,
      bankRatingReviewedTopTwo: row.bankRatingReviewedTopTwo,
      reconciledWithin60Days: row.reconciledWithin60Days,
      reconciliationIndependentlyReviewed: row.reconciliationIndependentlyReviewed,
      doeStatusApproved: row.doeStatusApproved,
      yearsInOperation: row.yearsInOperation,
      suretyBondPosted: row.suretyBondPosted,
      fesuaAnyAccountOver50k: row.fesuaAnyAccountOver50k,
    }
  }

  /** GET — tenant-checked read; returns the row or an all-nulls public shape. */
  async get(schoolId: string, periodId: string): Promise<ComplianceInputsPublic> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const row = await this.findRow(schoolId, period.id)
    return this.toPublic(row)
  }

  /**
   * PUT — tenant-checked upsert. Merges the partial DTO over the existing row
   * (explicit null clears, absent keeps), defends the programs subset + the
   * non-negative bounds (defence in depth beyond the DTO), upserts, audits.
   */
  async upsert(
    schoolId: string,
    periodId: string,
    dto: UpsertComplianceInputsDto,
    userId: string,
  ): Promise<ComplianceInputsPublic> {
    const period = await this.periods.getOwnedPeriod(schoolId, periodId)
    const existing = await this.findRow(schoolId, period.id)

    const pick = <T>(dtoVal: T | undefined, current: T): T =>
      dtoVal === undefined ? current : dtoVal

    // Defence in depth: invalid program tiers can never reach the pure package.
    if (dto.programs !== undefined) {
      const bad = dto.programs.filter((p) => !VALID_PROGRAMS.includes(p))
      if (bad.length > 0) {
        throw new BadRequestException(`Unknown program tier(s): ${bad.join(', ')}.`)
      }
    }

    const scholarshipFundsReceived = pick(
      dto.scholarshipFundsReceived,
      existing ? dec(existing.scholarshipFundsReceived) : null,
    )
    if (scholarshipFundsReceived !== null && scholarshipFundsReceived < 0) {
      throw new BadRequestException('scholarshipFundsReceived cannot be negative.')
    }
    const yearsInOperation = pick(
      dto.yearsInOperation,
      existing?.yearsInOperation ?? null,
    )
    if (yearsInOperation !== null && yearsInOperation < 0) {
      throw new BadRequestException('yearsInOperation cannot be negative.')
    }

    const data = {
      scholarshipFundsReceived,
      programs: sanitizePrograms(pick(dto.programs, existing?.programs ?? [])),
      fundsAtInsuredInstitution: pick(
        dto.fundsAtInsuredInstitution,
        existing?.fundsAtInsuredInstitution ?? null,
      ),
      avgDailyBalanceOver250k: pick(
        dto.avgDailyBalanceOver250k,
        existing?.avgDailyBalanceOver250k ?? null,
      ),
      bankRatingReviewedTopTwo: pick(
        dto.bankRatingReviewedTopTwo,
        existing?.bankRatingReviewedTopTwo ?? null,
      ),
      reconciledWithin60Days: pick(
        dto.reconciledWithin60Days,
        existing?.reconciledWithin60Days ?? null,
      ),
      reconciliationIndependentlyReviewed: pick(
        dto.reconciliationIndependentlyReviewed,
        existing?.reconciliationIndependentlyReviewed ?? null,
      ),
      doeStatusApproved: pick(dto.doeStatusApproved, existing?.doeStatusApproved ?? null),
      yearsInOperation,
      suretyBondPosted: pick(dto.suretyBondPosted, existing?.suretyBondPosted ?? null),
      fesuaAnyAccountOver50k: pick(
        dto.fesuaAnyAccountOver50k,
        existing?.fesuaAnyAccountOver50k ?? null,
      ),
      notes: pick(dto.notes, existing?.notes ?? null),
      updatedByUserId: userId,
    }

    const row = await this.prisma.periodComplianceInputs.upsert({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId: period.id } },
      create: { schoolId, fiscalPeriodId: period.id, ...data },
      update: data,
    })

    await this.audit.write({
      schoolId,
      userId,
      action: 'compliance.inputs_updated',
      targetType: 'period_compliance_inputs',
      targetId: row.id,
      metadata: { fiscalPeriodId: period.id, fields: Object.keys(dto) },
    })

    return this.toPublic(row)
  }
}
