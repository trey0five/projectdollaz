import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator'

export const BULK_ADOPT_MODES = ['propose', 'confirm'] as const
export type BulkAdoptMode = (typeof BULK_ADOPT_MODES)[number]

/** Hard ceiling on one diocesan push. Sixty schools is already a large diocese. */
export const BULK_ADOPT_MAX_SCHOOLS = 60

/**
 * `proposalHash` is REQUIRED on confirm and FORBIDDEN on propose.
 *
 * [DEVIATION from the frozen spec, and it is a correctness fix.] The spec text
 * declared a second, differently-named property
 * (`@ValidateIf(o => o.mode === 'propose') @IsEmpty() proposalHashOnPropose?: never`)
 * to express the propose-side guard. That property would be vacuous — it is always
 * `undefined`, so `@IsEmpty()` always passes — while `proposalHash` itself stayed
 * unguarded on propose, which is precisely the case §6.2 says must not be silently
 * ignored. Stacking two mutually-exclusive `@ValidateIf`s on ONE property does not
 * work either: class-validator ANDs every registered condition for a property, so
 * the property would then be validated in NEITHER mode.
 *
 * One constraint that reads `mode` off the sibling object is the shape that
 * actually holds both halves. The DTO spec proves both directions.
 */
@ValidatorConstraint({ name: 'proposalHashForMode', async: false })
export class ProposalHashForMode implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const mode = (args.object as { mode?: unknown }).mode
    if (mode === 'confirm') {
      return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
    }
    // propose (and any invalid mode, which @IsIn rejects separately): a hash must
    // not be smuggled in and quietly dropped.
    return value === undefined || value === null || value === ''
  }

  defaultMessage(args: ValidationArguments): string {
    return (args.object as { mode?: unknown }).mode === 'confirm'
      ? 'proposalHash must be the 64-character hex hash returned by the propose call'
      : 'proposalHash must not be sent on a propose call'
  }
}

/**
 * AIC Phase I §6 — PUSH ONE INTERVENTION TO N SCHOOLS, propose then confirm.
 *
 * The write path rides Phase G's ALREADY-IDEMPOTENT `ImprovementService.adopt`,
 * which dedupes on `(originType, originRef)`. There is deliberately no second
 * dedupe here: two mechanisms for one invariant is how they drift apart.
 */
export class BulkAdoptDto {
  /**
   * `propose` performs ZERO writes and returns the per-school preview plus a
   * `proposalHash`; `confirm` requires that hash back and is the only mode that
   * writes. A superintendent confirms the list they were shown, not a list that
   * changed underneath them.
   */
  @IsIn(BULK_ADOPT_MODES)
  mode!: BulkAdoptMode

  /**
   * The CATALOG standard, never a school's clone id. School standards are
   * per-school clones — fourteen schools hold fourteen different ids for the same
   * standard — so the catalog row is the only comparable identity.
   */
  @IsUUID()
  catalogStandardId!: string

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_ADOPT_MAX_SCHOOLS)
  @IsUUID('4', { each: true })
  schoolIds!: string[]

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  targetRubricScore?: number

  /** Required on confirm, forbidden on propose — see ProposalHashForMode above. */
  @Validate(ProposalHashForMode)
  proposalHash?: string
}
