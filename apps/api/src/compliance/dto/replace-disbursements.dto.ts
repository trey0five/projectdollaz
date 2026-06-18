import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import type { ScholarshipProgram } from '@finrep/compliance'

const PROGRAMS = ['FTC', 'FES_EO', 'FES_UA'] as const

/** A sane upper bound on a single funding-org export (one period). */
export const MAX_DISBURSEMENT_ROWS = 20000

/**
 * One parsed disbursement row (the web parses the funding-org CSV/XLSX in the
 * browser and posts the mapped rows). `amount` is required + numeric; `program`
 * is one of the three tiers OR null (an unknown program is tolerated and flagged
 * by the pure reconciliation, never rejected here — we only reject a malformed
 * STRING that isn't null/valid). `payDate` is ISO yyyy-mm-dd or null.
 */
export class DisbursementRowDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  studentRef?: string | null

  @IsOptional()
  @IsIn(PROGRAMS)
  program?: ScholarshipProgram | null

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'payDate must be ISO yyyy-mm-dd or null.' })
  payDate?: string | null

  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number

  @IsOptional()
  @IsString()
  @MaxLength(120)
  term?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(200)
  batchRef?: string | null
}

/** Replace the period's entire disbursement set with this validated array. */
export class ReplaceDisbursementsDto {
  @IsArray()
  @ArrayMaxSize(MAX_DISBURSEMENT_ROWS)
  @ValidateNested({ each: true })
  @Type(() => DisbursementRowDto)
  rows!: DisbursementRowDto[]
}
