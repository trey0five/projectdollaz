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

/** Exported enum arrays so the service, tests, and FE stay in sync with the DTO. */
export const MAINTENANCE_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
export const MAINTENANCE_STATUSES = ['open', 'scheduled', 'in_progress', 'resolved'] as const
/** Preventive-maintenance cadence (mirrors the Task TASK_RECURRENCES convention). */
export const MAINTENANCE_RECURRENCES = ['none', 'weekly', 'monthly', 'quarterly', 'annual'] as const

/**
 * Create a maintenance item. forbidNonWhitelisted-SAFE: EVERY field is
 * class-validator decorated, so a stray/unknown key 400s. Nullable fields are
 * `@IsOptional()`, which — by class-validator semantics — skips validation for
 * BOTH `undefined` (omitted) AND `null` (explicit clear), so `null` passes the
 * whitelist (same pattern as the accreditation DTOs).
 *
 * priority/status are @IsIn enums (the DB stores TEXT with a @default). location /
 * category are FREE TEXT v1. estimatedCost is a bounded 2-dp number (Decimal(14,2)
 * caps at ~1 trillion; @Max keeps it well under JS Number 2^53-cents exactness).
 */
export class CreateMaintenanceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string

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

  // Realized spend. Bounded 2-dp number (mirrors estimatedCost); the service surfaces
  // variance (actual − estimated) in the response.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  actualCost?: number | null

  // Non-PII business/contractor name. Free text v1.
  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendor?: string | null

  @IsOptional()
  @IsDateString()
  targetDate?: string | null

  // ── Preventive maintenance (additive). recurrence @IsIn the allowed cadence set;
  // seriesId is SERVER-ONLY and NEVER accepted from the client (forbidNonWhitelisted
  // 400s a stray series_id). Mirrors the Task recurrence DTO. ─────────────────────
  @IsOptional()
  @IsIn(MAINTENANCE_RECURRENCES as unknown as string[])
  recurrence?: string

  @IsOptional()
  @IsDateString()
  recurrenceUntil?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null
}
