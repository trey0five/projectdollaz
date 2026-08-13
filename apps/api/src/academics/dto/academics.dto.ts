// ─────────────────────────────────────────────────────────────────────────────
// Academics DTOs. The API runs a global forbidNonWhitelisted ValidationPipe, so
// EVERY field a client may send has to appear here or the request 400s — that
// is the point, not an inconvenience.
//
// Status/vocabulary columns are TEXT bounded by @IsIn against the shared
// @finrep/db arrays, never a Postgres enum, so adding a test type is a one-line
// change rather than a migration.
// ─────────────────────────────────────────────────────────────────────────────
import { Type } from 'class-transformer'
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
  @Type(() => Boolean)
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
