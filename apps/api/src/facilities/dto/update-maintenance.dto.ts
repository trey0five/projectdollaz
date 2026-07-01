import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from './create-maintenance.dto.js'

/**
 * Patch a maintenance item. ALL fields optional (partial PATCH). Hand-written (not
 * PartialType) so the forbidNonWhitelisted whitelist stays explicit and the
 * merge-pick semantics are obvious: an OMITTED key keeps the current value; an
 * explicit `null` on a nullable field CLEARS it. title cannot be cleared
 * (non-nullable column), so it carries @IsString/@MinLength when present.
 */
export class UpdateMaintenanceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string | null

  @IsOptional()
  @IsIn(MAINTENANCE_PRIORITIES as unknown as string[])
  priority?: string

  @IsOptional()
  @IsIn(MAINTENANCE_STATUSES as unknown as string[])
  status?: string

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  estimatedCost?: number | null

  @IsOptional()
  @IsDateString()
  targetDate?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null
}
