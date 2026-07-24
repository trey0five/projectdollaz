import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * Body for POST /admin/admins (super-admin only). An existing user is promoted
 * (isAdmin=true; any `password` sent is ignored). A brand-new account requires a
 * strength-checked `password`. Every field is whitelisted so the global
 * forbidNonWhitelisted pipe does not 400.
 */
export class CreateAdminDto {
  @IsEmail()
  @MaxLength(320)
  email!: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string
}
