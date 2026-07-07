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
import { GOAL_TYPES, type GoalType } from '../strategy.constants.js'
import { MilestoneInputDto } from './create-goal.dto.js'

/**
 * Patch a goal. ALL fields optional. Omitted keeps; explicit null clears a nullable
 * field. Changing metricKey/targetValue re-binds the metric (service re-validates +
 * mix-rejects and RE-FREEZES the baseline). To reset the frozen baseline
 * intentionally, use POST goals/:goalId/rebaseline — NOT this patch.
 */
export class UpdateGoalDto {
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
  @IsIn(GOAL_TYPES)
  goalType?: GoalType

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  orderIndex?: number

  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  manualProgressPct?: number | null

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MilestoneInputDto)
  milestones?: MilestoneInputDto[] | null
}
