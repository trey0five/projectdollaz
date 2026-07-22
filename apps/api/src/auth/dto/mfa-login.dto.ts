import { Transform } from 'class-transformer'
import { IsString, Matches, MaxLength } from 'class-validator'

export class MfaLoginDto {
  @IsString()
  @MaxLength(2048)
  mfa_token!: string

  // 6-digit TOTP OR 10-char backup code; dashes/spaces stripped, uppercased.
  // The shape (all-digits-6 vs alphanumeric-10) is what routes verification —
  // backup codes use an alphabet with no 0/1/I/L/O so the shapes are disjoint.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : value,
  )
  @IsString()
  @Matches(/^(\d{6}|[A-Z2-9]{10})$/)
  code!: string
}
