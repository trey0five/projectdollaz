import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

/**
 * Create a standing alert. `type` picks the shape: a scheduled DIGEST needs a
 * `cadence`; a THRESHOLD alert needs `metricKey` + `operator` + `threshold`. The
 * per-type required-field check lives in AlertService.create (a discriminated
 * DTO would need class-transformer wiring the rest of the app doesn't use); this
 * DTO only whitelists the fields so the global forbidNonWhitelisted pipe doesn't
 * 400. `recipientEmail` defaults to the creator's email when omitted.
 */
export class CreateAlertDto {
  @IsIn(['digest', 'threshold'])
  type!: string

  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly'])
  cadence?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  metricKey?: string

  @IsOptional()
  @IsIn(['lt', 'gt'])
  operator?: string

  @IsOptional()
  @IsNumber()
  threshold?: number

  @IsOptional()
  @IsEmail()
  recipientEmail?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}
