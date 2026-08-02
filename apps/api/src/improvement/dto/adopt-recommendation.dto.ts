import {
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
} from 'class-validator'
import { RECOMMENDATION_TEMPLATE_IDS } from '@finrep/compliance'
import {
  IMPROVEMENT_ORIGIN_TYPES,
  IMPROVEMENT_PROGRESS_SOURCES,
  type ImprovementOriginType,
  type ImprovementProgressSource,
} from '../improvement.constants.js'

/**
 * Turn a recommendation into an owned, dated piece of work.
 *
 * IDEMPOTENT BY CONSTRUCTION (acceptance 5): adopting the same recommendation
 * twice returns the SAME initiative with a 200. The uniqueness is enforced in
 * Postgres — `@@unique([schoolId, findingKey])` — not by a read-then-write race,
 * and gap/assurance adoptions dedupe on `(originType, originRef)`. A school that
 * clicks twice does not end up managing two copies of one commitment.
 */
export class AdoptRecommendationDto {
  @IsIn(RECOMMENDATION_TEMPLATE_IDS)
  templateId!: string

  @IsIn(IMPROVEMENT_ORIGIN_TYPES)
  originType!: ImprovementOriginType

  /** The standardId (gap/assurance) or the findingKey (finding). NEVER blank. */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  originRef!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  findingKey?: string | null

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null

  @IsOptional()
  @IsDateString()
  dueDate?: string | null

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  targetRubricScore?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(64)
  metricKey?: string | null

  /**
   * How the adopted work MEASURES ITSELF.
   *
   * Optional, and omitting it keeps the old behaviour exactly: no source, and the
   * initiative reports status only. What it makes possible is the phase's stated
   * payoff — "progress computed from the school's own numbers" — for a
   * recommendation, which before this could only ever be status-only work, since
   * adopt was the ONLY creation path for one and it had no way to say how the
   * work was measured.
   */
  @IsOptional()
  @IsIn(IMPROVEMENT_PROGRESS_SOURCES)
  progressSource?: ImprovementProgressSource | null

  /** The KPI value this work is aiming at, in the metric's RAW unit (0..1 for a share). */
  @IsOptional()
  @IsNumber()
  targetValue?: number | null
}
