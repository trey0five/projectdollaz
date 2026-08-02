import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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

// ── AIC Phase F — WHAT KIND OF REGULATORY INSPECTION AN ITEM IS ───────────────
//
// The CLOSED vocabulary for MaintenanceItem.complianceKind. This is the api-side
// source of truth (the frontend hard-copies the array — the COMMITTEE_KINDS /
// PERSON_GROUPS precedent).
//
// THERE IS DELIBERATELY NO 'other'. A kind we did not model is recorded with
// complianceKind = null and the item keeps today's behaviour exactly. "An
// inspection of an unnamed kind is overdue" is a sentence this product will not
// say. The column is likewise NEVER inferred from `title`, `category` or
// `location` — those are free text, and the Phase-C requirement seed already
// published the promise "We will not guess it from free text."
export const MAINTENANCE_COMPLIANCE_KINDS = [
  'fire_life_safety',
  'boiler',
  'elevator',
  'asbestos',
  'health',
  'water_quality',
  'playground',
] as const
export type MaintenanceComplianceKind = (typeof MAINTENANCE_COMPLIANCE_KINDS)[number]

/**
 * The LIFE-SAFETY subset. It drives ONE thing and only one thing: the severity of
 * the FAC-INSPECTION-DUE finding in @finrep/compliance. It is not a permission, not
 * a filter and not a display grouping.
 */
export const LIFE_SAFETY_COMPLIANCE_KINDS = [
  'fire_life_safety',
  'boiler',
  'elevator',
  'asbestos',
] as const

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

  // Non-PII business/contractor name. Free text v1 (kept — display fallback).
  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendor?: string | null

  // Structured vendor link (vendors register). School-ownership validated in the
  // service (400 on a foreign/unknown vendor).
  @IsOptional()
  @IsUUID()
  vendorId?: string | null

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

  // ── AIC Phase F — WHAT KIND of regulatory inspection this item is. Closed
  // vocabulary (@IsIn MAINTENANCE_COMPLIANCE_KINDS), NEVER inferred from
  // title/category/location. Omitted or null ⇒ an ordinary maintenance item, which
  // behaves EXACTLY as it does today. There is no 'other'.
  @IsOptional()
  @IsIn(MAINTENANCE_COMPLIANCE_KINDS as unknown as string[])
  complianceKind?: string | null
}
