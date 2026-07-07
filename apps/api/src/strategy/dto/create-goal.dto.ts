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
import { GOAL_TYPES, type GoalType } from '../strategy.constants.js'

/** One milestone in a goalType='milestone' goal. `id` is server-assigned on create
 *  when omitted; `done` defaults false. forbidNonWhitelisted-safe nested object. */
export class MilestoneInputDto {
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
 * Create a goal under a pillar. forbidNonWhitelisted-SAFE. The metric binding
 * (metricKey/targetValue) applies only to goalType='metric' — the service validates
 * metricKey ∈ the canonical registry and REJECTS the mix keys. Percent/share targets
 * are stored as a 0..1 fraction (the web layer converts the natural display unit).
 */
export class CreateGoalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null

  @IsOptional()
  @IsIn(GOAL_TYPES)
  goalType?: GoalType

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  orderIndex?: number

  /** Accountable owner — validated as an active school member by the service. */
  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null

  /** Canonical MetricKey (goalType='metric'); validated + mix-rejected in the service. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  metricKey?: string | null

  @IsOptional()
  @IsNumber()
  targetValue?: number | null

  @IsOptional()
  @IsDateString()
  startDate?: string | null

  @IsOptional()
  @IsDateString()
  targetDate?: string | null

  /** goalType='manual' — hand-set progress 0..1. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  manualProgressPct?: number | null

  /** goalType='milestone' — the milestone checklist. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneInputDto)
  milestones?: MilestoneInputDto[] | null
}
