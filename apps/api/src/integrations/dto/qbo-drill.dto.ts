import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator'

/**
 * QuickBooks transaction drill-down request. Every field is whitelisted for the
 * global forbidNonWhitelisted pipe. Resolution precedence (in the service):
 * statement+variant+lineKey → metricKey → accts. At least one selection is required
 * or the service 400s. `accts` are ENGINE account numbers (the only client-supplied
 * account path — a same-tenant fallback; the primary path resolves accounts
 * server-side from the stored snapshot lineage).
 */
export class QbDrillDto {
  @IsString()
  @MinLength(1)
  periodId!: string

  @IsIn(['SOA', 'SFP', 'SCF', 'NetAssets'])
  @IsOptional()
  statement?: 'SOA' | 'SFP' | 'SCF' | 'NetAssets'

  @IsIn(['cy', 'py', 'audit'])
  @IsOptional()
  variant?: 'cy' | 'py' | 'audit'

  @IsString()
  @IsOptional()
  lineKey?: string

  @IsString()
  @IsOptional()
  metricKey?: string

  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @IsOptional()
  accts?: number[]

  @IsIn(['Accrual', 'Cash'])
  @IsOptional()
  basis?: 'Accrual' | 'Cash'

  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  limit?: number
}
