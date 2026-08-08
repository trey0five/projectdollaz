import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

/** Mirrors the engine's ConfidenceClass. Kept in sync deliberately — see below. */
export const CONFIDENCE_VALUES = ['committed', 'scheduled', 'modelled', 'assumption'] as const
export const RECURRENCE_VALUES = [
  'once',
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'quarterly',
  'annual',
] as const

/**
 * A dated obligation or receipt.
 *
 * THE @IsIn LISTS MUST TRACK THE ENGINE'S UNIONS. A recurrence the engine
 * understands but this DTO rejects is a control the school cannot use; one this
 * DTO accepts and the engine does not know silently produces no events, which is
 * worse — the commitment appears saved and never reaches a forecast. A spec pins
 * both lists against the engine's exported constants.
 */
export class SaveCommitmentDto {
  @IsString()
  @MaxLength(120)
  label!: string

  @IsString()
  @MaxLength(60)
  category!: string

  @IsIn(['in', 'out'])
  direction!: 'in' | 'out'

  /** Positive magnitude — direction carries the sign. */
  @IsNumber()
  @Min(0)
  amount!: number

  @IsIn(CONFIDENCE_VALUES as unknown as string[])
  confidence!: string

  @IsIn(RECURRENCE_VALUES as unknown as string[])
  recurrence!: string

  @IsISO8601()
  startDate!: string

  @IsOptional()
  @IsISO8601()
  endDate?: string | null

  /** Semi-monthly only. 31 means the month's last day. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(31, { each: true })
  dayRule?: number[] | null

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null

  @IsOptional()
  @IsBoolean()
  active?: boolean
}
