import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator'

/**
 * AIC Phase F — the STAFF EVALUATION register DTOs.
 *
 * ADULT-STAFF EMPLOYMENT PII. These DTOs are the WRITE surface; the read surface is
 * split in two by §4.1 of the phase contract — the register routes (owner/accountant
 * only) may name a person, and the `/summary` route (all roles) returns COUNTS ONLY.
 *
 * forbidNonWhitelisted-SAFE: EVERY field is class-validator decorated, so a stray or
 * unknown key 400s. Nullable fields are @IsOptional, which — by class-validator
 * semantics — skips validation for BOTH `undefined` (omitted) and `null` (explicit
 * clear), the same pattern as the governance/facilities DTOs.
 *
 * The closed status vocabulary below is the api-side source of truth; the frontend
 * hard-copies the array (the COMMITTEE_KINDS / PERSON_GROUPS precedent). TEXT column
 * + @IsIn — no Postgres enums, house convention.
 */
export const STAFF_EVALUATION_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  'waived',
] as const
export type StaffEvaluationStatus = (typeof STAFF_EVALUATION_STATUSES)[number]

export class CreateStaffEvaluationDto {
  /**
   * A GovernancePerson of THIS school whose `groups` contains 'staff'. Validated in
   * the service (400 naming the reason) — there is no second person table.
   */
  @IsUUID()
  personId!: string

  /** Free text, e.g. '2025-26 annual cycle'. */
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  cycleLabel!: string

  /**
   * REQUIRED — the clock the overdue arithmetic reads. An evaluation record with no
   * due date can be neither overdue nor current; it is not a cycle record, and
   * admitting one would put an unanswerable row in the register the rule counts.
   */
  @IsDateString()
  dueDate!: string

  /**
   * Non-null ⇒ the evaluation happened, WHATEVER the status column says. May precede
   * dueDate — an early evaluation is legal and is not an error.
   */
  @IsOptional()
  @IsDateString()
  completedDate?: string | null

  /** PII. Never leaves the owner/accountant register routes. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  evaluatorName?: string | null

  @IsOptional()
  @IsIn(STAFF_EVALUATION_STATUSES as unknown as string[])
  status?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null
}

export class UpdateStaffEvaluationDto {
  // personId is DELIBERATELY ABSENT — re-pointing an evaluation at a different
  // person is a delete plus a create, not an edit (the record would silently claim a
  // different employee was evaluated on the original dates). forbidNonWhitelisted
  // 400s a stray personId, which is exactly the intent.

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  cycleLabel?: string

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @IsDateString()
  completedDate?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(200)
  evaluatorName?: string | null

  @IsOptional()
  @IsIn(STAFF_EVALUATION_STATUSES as unknown as string[])
  status?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null
}

/**
 * List filters. `overdue` arrives as a query STRING, so it is bounded by @IsIn
 * ('true' | 'false') rather than @IsBoolean — the same shape the twin query DTO uses
 * for its string-typed flags, and it keeps forbidNonWhitelisted happy without a
 * transform that could coerce a typo into `false`.
 */
export class ListStaffEvaluationsQueryDto {
  @IsOptional()
  @IsIn(STAFF_EVALUATION_STATUSES as unknown as string[])
  status?: string

  @IsOptional()
  @IsUUID()
  personId?: string

  @IsOptional()
  @IsIn(['true', 'false'])
  overdue?: 'true' | 'false'

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cycleLabel?: string
}
