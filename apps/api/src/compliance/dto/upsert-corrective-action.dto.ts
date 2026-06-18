import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'

const CAP_STATUSES = ['open', 'in_progress', 'complete'] as const

/**
 * One editable CAP row keyed by ruleId. All editable fields optional so a partial
 * PUT is allowed; an explicit `null` clears the field (distinct from omitted, which
 * keeps). Strings are length-bounded; targetDate is an ISO date string or null;
 * status is restricted to the three-value enum (re-validated in the service).
 */
export class CapEntryUpsertDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  ruleId!: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observation?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  rootCause?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  correctiveAction?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(500)
  responsibleParty?: string | null

  @IsOptional()
  @IsDateString()
  targetDate?: string | null

  @IsOptional()
  @IsIn(CAP_STATUSES)
  status?: (typeof CAP_STATUSES)[number]
}

/** PUT body: a mergeable set of CAP rows. */
export class UpsertCorrectiveActionDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CapEntryUpsertDto)
  entries!: CapEntryUpsertDto[]
}
