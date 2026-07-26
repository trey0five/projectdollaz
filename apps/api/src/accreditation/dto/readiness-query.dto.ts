import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'

/**
 * Query DTO for GET /schools/:schoolId/accreditation/readiness. Whitelisted so
 * the global forbidNonWhitelisted ValidationPipe passes (the live-caught
 * gotcha). Both optional:
 *  - target      : desired index (e.g. 280/320/360); defaults to the resolved
 *                  framework's defaultTarget. Bounded to the plausible index
 *                  domain (100..400 is Cognia's whole scale).
 *  - frameworkId : explicit framework; defaults to the school's dominant one.
 */
export class ReadinessQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(400)
  target?: number

  @IsOptional()
  @IsUUID()
  frameworkId?: string
}
