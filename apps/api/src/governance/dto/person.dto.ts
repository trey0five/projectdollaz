import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator'

/**
 * Governance Phase 2 — PEOPLE + COMMITTEE MEMBERSHIP DTOs. All in one file (the
 * frozen contract): the shared constants below are the ONE api-side source for
 * the closed group/role vocabularies (the frontend hard-copies the arrays, the
 * COMMITTEE_KINDS precedent). Free text + @IsIn bounding — NO Postgres enums.
 */
export const PERSON_GROUPS = ['board', 'finance_team', 'staff'] as const
export type PersonGroup = (typeof PERSON_GROUPS)[number]

export const MEMBER_ROLES = ['chair', 'vice_chair', 'secretary', 'member'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

/**
 * Create a governance person. forbidNonWhitelisted-SAFE: EVERY field decorated.
 * Nullable fields are @IsOptional (skips BOTH undefined and null — the same
 * pattern as the committee/meeting DTOs, so an explicit null clears on PATCH).
 * termStart/termEnd arrive as ISO date strings; the service parses them to
 * UTC-midnight Dates and 400s when termEnd < termStart.
 */
export class CreatePersonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null

  @IsOptional()
  @IsArray()
  @IsIn(PERSON_GROUPS, { each: true })
  @ArrayUnique()
  @ArrayMaxSize(3)
  groups?: PersonGroup[]

  @IsOptional()
  @IsDateString()
  termStart?: string | null

  @IsOptional()
  @IsDateString()
  termEnd?: string | null

  @IsOptional()
  @IsEmail()
  email?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string | null

  @IsOptional()
  @IsBoolean()
  active?: boolean

  @IsOptional()
  @IsUUID()
  userId?: string | null
}

/**
 * Patch a governance person. ALL fields optional (partial PATCH). Hand-written
 * (not PartialType) so the forbidNonWhitelisted whitelist stays explicit and the
 * merge-pick semantics are obvious: an OMITTED key keeps the current value; an
 * explicit `null` on a nullable field CLEARS it (title/termStart/termEnd/email/
 * bio/userId). name cannot be cleared (non-nullable column).
 */
export class UpdatePersonDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null

  @IsOptional()
  @IsArray()
  @IsIn(PERSON_GROUPS, { each: true })
  @ArrayUnique()
  @ArrayMaxSize(3)
  groups?: PersonGroup[]

  @IsOptional()
  @IsDateString()
  termStart?: string | null

  @IsOptional()
  @IsDateString()
  termEnd?: string | null

  @IsOptional()
  @IsEmail()
  email?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string | null

  @IsOptional()
  @IsBoolean()
  active?: boolean

  @IsOptional()
  @IsUUID()
  userId?: string | null
}

/**
 * Optional query filters for the people list. `active` arrives as a query STRING
 * ('true'|'false') — bounded by @IsIn, interpreted in the service.
 */
export class ListPeopleQueryDto {
  @IsOptional()
  @IsIn(PERSON_GROUPS)
  group?: PersonGroup

  @IsOptional()
  @IsIn(['true', 'false'])
  active?: 'true' | 'false'
}

/** Add a person to a committee. Duplicate membership → 409 (DB unique index). */
export class AddMemberDto {
  @IsUUID()
  personId!: string

  @IsOptional()
  @IsIn(MEMBER_ROLES)
  role?: MemberRole
}

/** Change a membership's role — the only mutable membership field. */
export class UpdateMemberDto {
  @IsIn(MEMBER_ROLES)
  role!: MemberRole
}
