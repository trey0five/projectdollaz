// ─────────────────────────────────────────────────────────────────────────────
// Academics DTOs. The API runs a global forbidNonWhitelisted ValidationPipe, so
// EVERY field a client may send has to appear here or the request 400s — that
// is the point, not an inconvenience.
//
// Status/vocabulary columns are TEXT bounded by @IsIn against the shared
// @finrep/db arrays, never a Postgres enum, so adding a test type is a one-line
// change rather than a migration.
// ─────────────────────────────────────────────────────────────────────────────
import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { LESSON_PLAN_STATUS_KEYS, TEST_TYPE_KEYS } from '@finrep/db'

/** Shared query shape for the summary/dashboard reads. */
/**
 * A query string has no booleans, only text — and `@Type(() => Boolean)` runs
 * Boolean("false"), which is TRUE. `unmatchedOnly=false` therefore filtered to
 * exactly the rows it was asked to stop filtering to. Only the words that mean
 * false are false; anything else non-empty is true.
 */
const queryBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  const s = String(value).trim().toLowerCase()
  if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false
  return true
}

export class AssessmentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100)
  schoolYear?: number

  @IsOptional()
  @IsIn(TEST_TYPE_KEYS as unknown as string[])
  testType?: string

  @IsOptional()
  @IsString()
  @MaxLength(8)
  gradeLevel?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  subject?: string

  @IsOptional()
  @IsString()
  @MaxLength(8)
  cohortGrade?: string

  /**
   * Anonymise every peer school SERVER-side. The dashboard's "Hide peer names"
   * control used to be a paint decision in the browser while the payload still
   * carried every name — this makes the control mean what it says.
   */
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  hidePeerNames?: boolean
}

/**
 * The longitudinal cohort read — its own query, not an extension of the
 * dashboard's.
 *
 * `series` rather than `subject`: on AssessmentQueryDto a null `subject` means
 * "the headline score" implicitly, which is fine for a chart with one line and
 * useless for a matrix whose Total column has to be a NAMED column beside the
 * subjects. 'total' is a first-class value here. The legacy routes keep their
 * `subject` and its implicit null.
 *
 * `window` is hard-capped at 4 by the validator, so a request for a six-grade
 * span is a 400 rather than a silently-clamped panel the client believes is six
 * grades wide. Below the cap the SERVER still clamps to what the school's
 * grades support and echoes the result back in `context.window`.
 */
export class CohortQueryDto {
  /** The END year every cohort finishes in — the anchor, not a filter. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100)
  schoolYear?: number

  @IsOptional()
  @IsIn(TEST_TYPE_KEYS as unknown as string[])
  testType?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(4)
  window?: number

  @IsOptional()
  @IsIn(['school', 'org'])
  scope?: string

  /** 'total' or a subject key; validated against the FAMILY in the service,
   *  which is the only place the family is known. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  series?: string

  /** Narrow to one cohort by the grade it ends in. */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  endGrade?: string

  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  hidePeerNames?: boolean

  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  includeMatrix?: boolean

  /** ORG ROUTE ONLY — which school the panels are cut for. Ignored on the
   *  per-school route, where the path already says. */
  @IsOptional()
  @IsUUID()
  focusSchoolId?: string
}

/** Multipart upload fields (the file itself rides outside the DTO). */
export class AssessmentUploadDto {
  @IsOptional()
  @IsIn(TEST_TYPE_KEYS as unknown as string[])
  testType?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100)
  schoolYear?: number

  @IsOptional()
  @IsString()
  @MaxLength(8)
  gradeLevel?: string
}

export class ResultQueryDto extends AssessmentQueryDto {
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  unmatchedOnly?: boolean
}

/** Attach an unmatched score row to a roster student by hand. */
export class AttachResultDto {
  @IsUUID()
  studentId!: string
}

export class CreateLessonPlanDto {
  @IsString()
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  subject?: string

  @IsOptional()
  @IsString()
  @MaxLength(8)
  gradeLevel?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  teacherName?: string

  @IsOptional()
  @IsIn(LESSON_PLAN_STATUS_KEYS as unknown as string[])
  status?: string

  @IsOptional()
  @IsISO8601()
  plannedOn?: string

  @IsOptional()
  @IsISO8601()
  weekOf?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string
}

export class UpdateLessonPlanDto extends CreateLessonPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  declare title: string
}

export class LessonPlanQueryDto {
  @IsOptional()
  @IsIn(LESSON_PLAN_STATUS_KEYS as unknown as string[])
  status?: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  subject?: string

  @IsOptional()
  @IsString()
  @MaxLength(8)
  gradeLevel?: string
}

export class GradebookQueryDto {
  @IsOptional()
  @IsUUID()
  courseId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100)
  schoolYear?: number

  @IsOptional()
  @IsString()
  @MaxLength(20)
  term?: string
}

/** Multipart fields for a gradebook upload (the file rides outside the DTO). */
export class GradebookUploadDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100)
  schoolYear?: number

  @IsOptional()
  @IsString()
  @MaxLength(20)
  term?: string
}
