import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

/**
 * Upsert per-period operational data (enrollment + financial aid). All fields are
 * optional so a partial PUT is allowed (e.g. only enrollment). Non-negative with
 * sane bounds. The cross-field rule students_on_aid <= enrollment can't be
 * enforced here on a partial PUT (class-validator can't see the persisted row), so
 * it is enforced in the service AFTER merging this DTO with the existing row.
 *
 * `null` is allowed (and distinct from omitted): the service treats an explicit
 * null as "clear this field". camelCase keys match the api-client/web body.
 */
export class UpsertOperationalDto {
  /** Headcount (primary enrollment number). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  enrollment?: number | null

  /** Optional full-time-equivalent enrollment. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  enrollmentFte?: number | null

  /** Count of students receiving aid. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  studentsOnAid?: number | null

  /** Total financial aid / scholarship dollars for the period. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  financialAidTotal?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null
}
