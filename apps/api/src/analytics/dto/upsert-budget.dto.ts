import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

/**
 * Upsert a period's budgeted top-line figures (budget-vs-actual). All optional so
 * a partial PUT is allowed; an explicit null clears a field. Non-negative, sane
 * bounds. camelCase keys match the api-client/web body.
 */
export class UpsertBudgetDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  totalRevenue?: number | null

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  totalExpenses?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null
}
