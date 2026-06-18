import { Transform } from 'class-transformer'
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/** Self-service profile update. Email is intentionally NOT editable here. */
export class UpdateProfileDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'first_name must not be empty.' })
  @MaxLength(120)
  first_name?: string

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'last_name must not be empty.' })
  @MaxLength(120)
  last_name?: string
}
