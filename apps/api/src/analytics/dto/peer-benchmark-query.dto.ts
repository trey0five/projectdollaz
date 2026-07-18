import { Type } from 'class-transformer'
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator'

/**
 * Query DTO for GET /organizations/:orgId/metrics/peers/:schoolId. Every field is
 * optional. Whitelisted so the global forbidNonWhitelisted ValidationPipe passes:
 *  - fiscalYearStart : YYYY-MM (same semantics as metrics/by-school)
 *  - dims            : CSV subset of size,county,district,type,grade
 *  - minPeers        : 1..50 (peer-group minimum before relaxation stops)
 */
export class PeerBenchmarkQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'fiscalYearStart must be YYYY-MM.',
  })
  fiscalYearStart?: string

  @IsOptional()
  @Matches(/^(size|county|district|type|grade)(,(size|county|district|type|grade))*$/, {
    message: 'dims must be a CSV subset of size,county,district,type,grade.',
  })
  dims?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  minPeers?: number
}
