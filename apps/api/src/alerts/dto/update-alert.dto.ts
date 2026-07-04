import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

/** Patch a standing alert: enable/disable, retarget, or edit any field. All optional. */
export class UpdateAlertDto {
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
