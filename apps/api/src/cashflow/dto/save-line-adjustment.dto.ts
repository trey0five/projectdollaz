import { IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'

/**
 * A per-line tuning of the DERIVED forecast sources — upserted by
 * (school, sourceRef), one adjustment per line.
 *
 * THE REGEX IS THE BOUNDARY OF WHAT MAY BE ADJUSTED. Only derived refs pass:
 * QuickBooks lines (qbo:ar:*, qbo:ap:*, qbo:history:*), budget phasing rows
 * (budget:*) and the tuition driver (driver:*). `commitment:*` is deliberately
 * rejected — a commitment is the school's own entry with a real editor of its
 * own, and an "adjustment on top of an edit" would give one line two competing
 * sources of truth.
 *
 * `overrideAmount` is required iff kind is 'override'; the DTO can only say
 * "optional", so the iff itself is enforced in the service where both fields
 * are visible together.
 */
/**
 * THE ONE COPY of that boundary, exported so a second caller cannot write a
 * second one. The assistant re-validates a proposed sourceRef against THIS regex
 * at build time, so a `commitment:*` ref is refused before the user is asked to
 * confirm rather than after they have — a 400 from /apply on an action the user
 * already approved is the worst place to discover the rule.
 */
export const ADJUSTABLE_SOURCE_REF_RE = /^(qbo:(ar|ap|history):|budget:|driver:)/

/** The frozen refusal, so both validation hops explain the boundary identically. */
export const ADJUSTABLE_SOURCE_REF_MESSAGE =
  'sourceRef must target a derived line (qbo:ar:*, qbo:ap:*, qbo:history:*, budget:* or driver:*) — commitments are edited directly.'

export class SaveLineAdjustmentDto {
  @IsString()
  @MaxLength(160)
  @Matches(ADJUSTABLE_SOURCE_REF_RE, { message: ADJUSTABLE_SOURCE_REF_MESSAGE })
  sourceRef!: string

  @IsIn(['exclude', 'override'])
  kind!: 'exclude' | 'override'

  /** The group's new total. Its events scale proportionally, preserving timing.
   *  Bounded to the column's Decimal(14,2): 2 decimal places, < 10^12 — so an
   *  absurd value 400s at the edge instead of 500ing on numeric overflow. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999)
  overrideAmount?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null
}
