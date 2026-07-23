import { Transform } from 'class-transformer'
import { IsString, MaxLength } from 'class-validator'

/**
 * Super-admin console login (hidden entry). Username-based — the platform admin
 * is keyed by a plain username (e.g. "tmunroe1"), NOT an email, so this is a
 * distinct DTO from the @IsEmail-validated user LoginDto. The username is stored
 * in the User.email column (a unique string; no format constraint) and matched
 * case-insensitively against the ADMIN_EMAILS allowlist in AuthService.adminLogin.
 */
export class AdminLoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @MaxLength(128)
  username!: string

  @IsString()
  @MaxLength(128)
  password!: string
}
