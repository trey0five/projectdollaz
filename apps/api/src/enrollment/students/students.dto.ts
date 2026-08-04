// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Student roster DTOs. FROZEN CONTRACT (see the phase spec):
// TEXT + @IsIn bounding against the canonical @finrep/analytics vocab (no Postgres
// enums), forbidNonWhitelisted-SAFE (EVERY field decorated), multi-value query
// params arrive as comma-separated strings and are @Transform-split before
// @IsIn({ each: true }). UpdateStudentDto is HAND-ROLLED all-optional (repo
// convention — no @nestjs/mapped-types PartialType) so the whitelist stays explicit.
// ─────────────────────────────────────────────────────────────────────────────
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import {
  AGE_BAND_KEYS,
  ETHNICITY_KEYS,
  GENDER_KEYS,
  GRADE_KEYS,
  RACE_KEYS,
  STUDENT_FLAG_KEYS,
  STUDENT_STATUS_KEYS,
  type AgeBandKey,
  type EthnicityKey,
  type GenderKey,
  type GradeKey,
  type RaceKey,
  type StudentFlagKey,
  type StudentStatusKey,
} from '@finrep/analytics'

/**
 * The per-request import-row ceiling. ONE constant so the reviewed-import DTO and
 * the one-step roster upload cannot drift into two different limits — a school
 * that is too large for one path must be too large for both, and say so.
 */
export const STUDENT_IMPORT_MAX_ROWS = 2000

/** Sortable register columns (grade sorts in JS by GRADE_KEYS index — see service). */
export const STUDENT_SORT_KEYS = [
  'lastName',
  'firstName',
  'grade',
  'status',
  'enrolledOn',
  'birthDate',
] as const
export type StudentSortKey = (typeof STUDENT_SORT_KEYS)[number]

/** Split a comma-separated query param into trimmed non-empty tokens. */
const csv = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : value

/**
 * Shared filter params — the register list AND /aggregate accept the SAME set so
 * the web register + analytics cards share one filter state. All optional; every
 * multi-value filter is OR within itself, AND across filters.
 */
export class StudentFilterQueryDto {
  /** Case-insensitive contains on firstName OR lastName. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(GRADE_KEYS, { each: true })
  grade?: GradeKey[]

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(STUDENT_STATUS_KEYS, { each: true })
  status?: StudentStatusKey[]

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(RACE_KEYS, { each: true })
  race?: RaceKey[]

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(GENDER_KEYS, { each: true })
  gender?: GenderKey[]

  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(ETHNICITY_KEYS, { each: true })
  ethnicity?: EthnicityKey[]

  /** OR semantics: any listed flag true (iep → hasIep, plan504 → has504, ell → ell). */
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(STUDENT_FLAG_KEYS, { each: true })
  flags?: StudentFlagKey[]

  /** Translated to birthDate ranges in the WHERE; `unknown` → birthDate IS NULL. */
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(AGE_BAND_KEYS, { each: true })
  ageBand?: AgeBandKey[]
}

/** Register list = the shared filters + sort/dir/page/pageSize. */
export class ListStudentsQueryDto extends StudentFilterQueryDto {
  @IsOptional()
  @IsIn(STUDENT_SORT_KEYS)
  sort?: StudentSortKey

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number
}

/**
 * Create one student. DATA-MINIMAL (FERPA): the whitelist below is the ENTIRE
 * per-student surface — no SSN/address/phone/email/guardian/medical fields exist.
 * Cross-field rule enforced in the service: withdrawnOn set ⇒ status ∈
 * {withdrawn, graduated}.
 */
export class CreateStudentDto {
  @IsString()
  @Length(1, 120)
  firstName!: string

  @IsString()
  @Length(1, 120)
  lastName!: string

  @IsIn(GRADE_KEYS)
  grade!: GradeKey

  @IsOptional()
  @IsIn(GENDER_KEYS)
  gender?: GenderKey | null

  @IsOptional()
  @IsIn(RACE_KEYS)
  race?: RaceKey | null

  @IsOptional()
  @IsIn(ETHNICITY_KEYS)
  ethnicity?: EthnicityKey | null

  @IsOptional()
  @IsDateString()
  birthDate?: string | null

  @IsOptional()
  @IsIn(STUDENT_STATUS_KEYS)
  status?: StudentStatusKey

  @IsOptional()
  @IsDateString()
  enrolledOn?: string | null

  @IsOptional()
  @IsDateString()
  withdrawnOn?: string | null

  @IsOptional()
  @IsBoolean()
  hasIep?: boolean

  @IsOptional()
  @IsBoolean()
  has504?: boolean

  @IsOptional()
  @IsBoolean()
  ell?: boolean

  /** UI copy: "Operational notes only — no medical/diagnostic details." */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null

  /** OneRoster sourcedId → idempotent re-import. '' is normalized to null. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalId?: string | null
}

/** PATCH — every CreateStudentDto field, all optional (hand-rolled PartialType). */
export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  firstName?: string

  @IsOptional()
  @IsString()
  @Length(1, 120)
  lastName?: string

  @IsOptional()
  @IsIn(GRADE_KEYS)
  grade?: GradeKey

  @IsOptional()
  @IsIn(GENDER_KEYS)
  gender?: GenderKey | null

  @IsOptional()
  @IsIn(RACE_KEYS)
  race?: RaceKey | null

  @IsOptional()
  @IsIn(ETHNICITY_KEYS)
  ethnicity?: EthnicityKey | null

  @IsOptional()
  @IsDateString()
  birthDate?: string | null

  @IsOptional()
  @IsIn(STUDENT_STATUS_KEYS)
  status?: StudentStatusKey

  @IsOptional()
  @IsDateString()
  enrolledOn?: string | null

  @IsOptional()
  @IsDateString()
  withdrawnOn?: string | null

  @IsOptional()
  @IsBoolean()
  hasIep?: boolean

  @IsOptional()
  @IsBoolean()
  has504?: boolean

  @IsOptional()
  @IsBoolean()
  ell?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalId?: string | null
}

/** All-or-nothing batch create (the Add-students wizard basket). */
export class BatchCreateStudentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateStudentDto)
  students!: CreateStudentDto[]
}

/** Stateless import commit: the previewed/user-edited candidate rows, sent back. */
export class ImportCommitDto {
  @IsIn(['merge', 'replace'])
  mode!: 'merge' | 'replace'

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(STUDENT_IMPORT_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => CreateStudentDto)
  rows!: CreateStudentDto[]
}

/** Explicit dated roster→snapshot backfill (default today). */
export class PromoteSnapshotDto {
  @IsOptional()
  @IsDateString()
  observedOn?: string
}
