import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { INITIATIVE_STATUSES, type InitiativeStatus } from '../../strategy/strategy.constants.js'
import {
  IMPROVEMENT_ORIGIN_TYPES,
  IMPROVEMENT_PROGRESS_SOURCES,
  IMPROVEMENT_RISK_LEVELS,
  type ImprovementOriginType,
  type ImprovementProgressSource,
  type ImprovementRiskLevel,
} from '../improvement.constants.js'

/**
 * One milestone on an improvement initiative.
 *
 * EVERY FIELD IS DECORATED. The app runs a GLOBAL `forbidNonWhitelisted`
 * ValidationPipe, so an undecorated property on a nested object is not "extra
 * data that gets ignored" — it is a 400 on the whole request.
 */
export class ImprovementMilestoneDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string

  @IsOptional()
  @IsBoolean()
  done?: boolean
}

/**
 * Create an improvement initiative. A superset of `CreateInitiativeDto` — the
 * five strategy fields are byte-identical, so the strategy route's payload is a
 * valid payload here — plus the Phase G columns.
 *
 * `goalId` is OPTIONAL and that is the point of the phase: an initiative adopted
 * from an accreditation gap or an early-warning finding has no strategic goal,
 * and a school that licenses accreditation but not strategy must still be able
 * to create one.
 */
export class CreateImprovementInitiativeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null

  @IsOptional()
  @IsIn(INITIATIVE_STATUSES)
  status?: InitiativeStatus

  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  orderIndex?: number

  // ── AIC Phase G ───────────────────────────────────────────────────────────
  /** Null / omitted = an initiative with no strategic goal. */
  @IsOptional()
  @IsUUID()
  goalId?: string | null

  @IsOptional()
  @IsIn(IMPROVEMENT_ORIGIN_TYPES)
  originType?: ImprovementOriginType

  @IsOptional()
  @IsString()
  @MaxLength(200)
  originRef?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(200)
  findingKey?: string | null

  @IsOptional()
  @IsDateString()
  startDate?: string | null

  @IsOptional()
  @IsDateString()
  dueDate?: string | null

  @IsOptional()
  @IsIn(IMPROVEMENT_PROGRESS_SOURCES)
  progressSource?: ImprovementProgressSource

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImprovementMilestoneDto)
  milestones?: ImprovementMilestoneDto[] | null

  /** A FRACTION, 0..1 — not a percentage. Bounded so 80 cannot mean 8000%. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  manualProgressPct?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(64)
  metricKey?: string | null

  @IsOptional()
  @IsNumber()
  targetValue?: number | null

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  targetRubricScore?: number | null

  /**
   * The HUMAN risk judgement. Never the computed `riskSignal` — the two are
   * separate fields on the read model and neither is ever written from the other.
   */
  @IsOptional()
  @IsIn(IMPROVEMENT_RISK_LEVELS)
  riskLevel?: ImprovementRiskLevel | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  riskNote?: string | null
}
