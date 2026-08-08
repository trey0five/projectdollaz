import { IsIn, IsISO8601, IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator'

export class SaveAssumptionsDto {
  /** { annual, semiannual, monthly10, monthly12 } — shares, normalised by the engine. */
  @IsOptional()
  @IsObject()
  planMix?: Record<string, number>

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  collectionRate?: number

  /**
   * Whether the rate was DERIVED from receivable aging or ENTERED by the school.
   * The server does not infer this: a suggested rate presented as a chosen one
   * (or the reverse) misstates who made the call, on the single most consequential
   * assumption in the model.
   */
  @IsOptional()
  @IsIn(['derived', 'entered'])
  collectionRateSource?: 'derived' | 'entered'

  /**
   * Null is meaningful and must stay reachable: no threshold means no shortfall
   * is reported at all, rather than one measured against a floor KYRO invented.
   */
  @IsOptional()
  @IsNumber()
  reserveThreshold?: number | null

  @IsOptional()
  @IsISO8601()
  firstBillingDate?: string | null
}
