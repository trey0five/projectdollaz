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
 * AIC Phase F — the PRIOR VISIT FINDINGS register DTOs.
 *
 * "The 2021 team cited you here, and it is still open" is the single most credible
 * sentence this product can say, and this register is the only place it can come
 * from: a real visiting team's own words, transcribed by the school.
 *
 * forbidNonWhitelisted-SAFE: EVERY field is class-validator decorated. Nullable
 * fields are @IsOptional (skips BOTH undefined and null), so an explicit null clears
 * on PATCH — the same pattern as the rest of the accreditation DTOs.
 *
 * `citedStandardCode` is FREE TEXT LIFTED FROM A PDF. It is stored VERBATIM as
 * entered; normalisation (trim + uppercase) happens at MATCH time only and is never
 * written back. It is bounded here at 40 characters, which is generous for every
 * accreditor code we have seen and short enough that it cannot become a second
 * `text` field.
 */
export const PRIOR_VISIT_STATUSES = ['open', 'closed'] as const
export type PriorVisitStatus = (typeof PRIOR_VISIT_STATUSES)[number]

export class CreatePriorVisitFindingDto {
  /**
   * Which accreditor's visit. OPTIONAL — a school may hold a report from a framework
   * it has not adopted here. Validated in the service: when supplied it must exist
   * and be active, else 400.
   */
  @IsOptional()
  @IsUUID()
  frameworkId?: string | null

  @IsDateString()
  visitDate!: string

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  citedStandardCode!: string

  /** What the team actually wrote. Shown on this register and NOWHERE else. */
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string

  @IsOptional()
  @IsIn(PRIOR_VISIT_STATUSES as unknown as string[])
  status?: string

  @IsOptional()
  @IsDateString()
  closedDate?: string | null

  /**
   * Free-text pointer to how it was closed (a document title, a URL, a board date).
   * NOT a foreign key and resolved by nothing: we will not imply we verified it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceRef?: string | null
}

/** Every create field, all optional. A PATCH never re-asserts what it did not send. */
export class UpdatePriorVisitFindingDto {
  @IsOptional()
  @IsUUID()
  frameworkId?: string | null

  @IsOptional()
  @IsDateString()
  visitDate?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  citedStandardCode?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text?: string

  @IsOptional()
  @IsIn(PRIOR_VISIT_STATUSES as unknown as string[])
  status?: string

  @IsOptional()
  @IsDateString()
  closedDate?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceRef?: string | null
}

export class ListPriorVisitFindingsQueryDto {
  @IsOptional()
  @IsIn(PRIOR_VISIT_STATUSES as unknown as string[])
  status?: string

  @IsOptional()
  @IsUUID()
  frameworkId?: string

  /**
   * Query strings arrive as text, so this is @IsIn('true','false') rather than
   * @IsBoolean — no transform that could quietly coerce a typo into `false`.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  unmatchedOnly?: 'true' | 'false'
}
