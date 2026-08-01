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
 * Create a standing alert. `type` picks the shape: a scheduled DIGEST (financial
 * summary) or WARNING_DIGEST (accreditation early warnings) needs a `cadence`; a
 * THRESHOLD alert needs `metricKey` + `operator` + `threshold`. A warning digest
 * REJECTS metricKey/operator/threshold — it watches the findings ledger. The
 * per-type required-field check lives in AlertService.create (a discriminated
 * DTO would need class-transformer wiring the rest of the app doesn't use); this
 * DTO only whitelists the fields so the global forbidNonWhitelisted pipe doesn't
 * 400. `recipientEmail` defaults to the creator's email when omitted.
 */
export class CreateAlertDto {
  // AIC Phase E — 'warning_digest' is the accreditation early-warning digest. It
  // rides the EXISTING scheduler, mailer and audit action; it is a third `type`,
  // not a second notification path.
  @IsIn(['digest', 'threshold', 'warning_digest'])
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
