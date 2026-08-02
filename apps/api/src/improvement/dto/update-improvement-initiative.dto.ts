import { Type } from 'class-transformer'
import {
  IsArray,
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
import { ImprovementMilestoneDto } from './create-improvement-initiative.dto.js'

/**
 * Patch an improvement initiative. Omitted keeps; explicit null clears a nullable
 * field — the same convention `UpdateInitiativeDto` established.
 *
 * `progressSource` can be set to null to return an initiative to status-only.
 */
export class UpdateImprovementInitiativeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string

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
  progressSource?: ImprovementProgressSource | null

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImprovementMilestoneDto)
  milestones?: ImprovementMilestoneDto[] | null

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

  @IsOptional()
  @IsIn(IMPROVEMENT_RISK_LEVELS)
  riskLevel?: ImprovementRiskLevel | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  riskNote?: string | null
}
