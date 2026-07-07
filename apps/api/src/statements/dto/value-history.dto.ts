import { IsIn, IsOptional, IsString } from 'class-validator'

/**
 * Value-history request body (periodId comes from the path). Whitelist-complete for
 * the global forbidNonWhitelisted ValidationPipe. Precedence in the service:
 * metricKey → statement + lineKey → 400. The `statement`/`variant` enums mirror the
 * drill DTO so the two read surfaces accept the same vocabulary.
 */
export class ValueHistoryDto {
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
}
