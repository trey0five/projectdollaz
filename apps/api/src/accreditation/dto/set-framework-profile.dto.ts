import { IsIn, IsOptional } from 'class-validator'
import { DIVISION_CODES } from '../divisions.js'

/**
 * WS1 — PATCH a framework's per-school profile (the division/seal choice).
 * forbidNonWhitelisted-SAFE: the one field is decorated; TEXT + @IsIn against
 * the closed divisions constant (house rule, never a PG enum). `@IsOptional`
 * lets an explicit `null` through — null CLEARS the division; the service 400s
 * a non-null division on a framework that has none.
 */
export class SetFrameworkProfileDto {
  @IsOptional()
  @IsIn(DIVISION_CODES)
  division?: string | null
}
