import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

/** Upsert a school's recurring board-summary delivery config. All optional. */
export class UpsertScheduleDto {
  @IsOptional()
  @IsIn(['weekly', 'monthly'])
  cadence?: string

  /** Comma / newline-separated recipient emails. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  recipients?: string

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}
