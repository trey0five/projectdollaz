import { Transform } from 'class-transformer'
import { IsString, Matches, MaxLength } from 'class-validator'

// Disabling MFA requires BOTH factors: the account password AND a current code
// (TOTP or backup) — a stolen access token alone cannot strip 2FA.
export class MfaDisableDto {
  @IsString()
  @MaxLength(128)
  password!: string

  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : value,
  )
  @IsString()
  @Matches(/^(\d{6}|[A-Z2-9]{10})$/)
  code!: string
}
