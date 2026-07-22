import { Transform } from 'class-transformer'
import { IsString, Matches } from 'class-validator'

export class MfaEnableDto {
  // Exactly the 6-digit TOTP from the just-scanned secret (spaces tolerated).
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s/g, '') : value))
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string
}
