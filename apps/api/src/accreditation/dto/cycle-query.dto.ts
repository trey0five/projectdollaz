import { IsOptional, IsUUID } from 'class-validator'

/** WS3 F1 — GET /accreditation/cycle query: explicit framework → else dominant. */
export class CycleQueryDto {
  @IsOptional()
  @IsUUID()
  frameworkId?: string
}
