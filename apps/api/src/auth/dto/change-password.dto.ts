import { IsString, MaxLength, MinLength } from 'class-validator'

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  current_password!: string

  // Service-level validateStrength is authoritative; this is fail-fast
  // defense-in-depth so trivially short inputs never reach the hasher.
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  new_password!: string
}
