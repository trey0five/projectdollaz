import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

/**
 * Query params for GET /admin/users. Every field is whitelisted so the global
 * forbidNonWhitelisted ValidationPipe does not 400 on the admin listing.
 */
export class AdminUsersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number
}
