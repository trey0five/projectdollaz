import { Type } from 'class-transformer'
import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { EnrollmentByGradeDto } from './save-driver-budget.dto.js'

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

  /**
   * Phase 5 — actual STAFF FTEs (distinct from the student-side enrollmentFte).
   * teachingFte is the instructional subset of totalStaffFte; the cross-field
   * teachingFte <= totalStaffFte is enforced in the service AFTER merge (a partial
   * PUT can't see the persisted row). Explicit null clears; omitted keeps stored.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  teachingFte?: number | null

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  totalStaffFte?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null

  /**
   * Phase 2 — anticipated incoming (net-new) students by grade from feeder
   * sources. All 14 grade keys explicit (reuses the driver DTO's per-grade
   * @Min(0) validation). Explicit null clears the stored map; omitted keeps it.
   */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EnrollmentByGradeDto)
  feederEnrollmentByGrade?: EnrollmentByGradeDto | null

  /**
   * Phase 2 Enrollment Intelligence — the PLANNED enrollment by grade the school
   * targets for this period. A FREE input (does NOT require a full driver budget);
   * its total is one of the plan sources for the enrollment_vs_plan metric. Reuses
   * the per-grade @Min(0) validation. Explicit null clears; omitted keeps stored.
   */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EnrollmentByGradeDto)
  plannedEnrollmentByGrade?: EnrollmentByGradeDto | null
}
