import { Transform } from 'class-transformer'
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator'

export class ResetPasswordDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  reset_code!: string

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  new_password!: string
}
