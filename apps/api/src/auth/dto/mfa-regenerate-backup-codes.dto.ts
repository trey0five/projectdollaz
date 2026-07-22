import { Transform } from 'class-transformer'
import { IsString, Matches, MaxLength } from 'class-validator'

// Same two-factor proof as disable: password + current code (TOTP or backup).
export class MfaRegenerateBackupCodesDto {
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
