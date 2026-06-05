import { Transform } from 'class-transformer'
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator'

export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string

  // Strength rules are enforced in PasswordService.validateStrength; keep a
  // coarse length guard here so an oversized payload is rejected early.
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  first_name!: string

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  last_name!: string
}
