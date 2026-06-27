import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { CAPITAL_GROUPS } from '../schedule.constants.js'

/**
 * One capital project line. EVERY field is decorated or the global
 * forbidNonWhitelisted ValidationPipe strips/400s it. Web sends real JSON
 * numbers, so @IsNumber() is correct (no implicit string->number coercion).
 * actual/budget may be negative (credits/refunds) — no @Min. over-under is NOT
 * stored (computed server-side in assemble).
 */
export class CapitalItemDto {
  // Client-generated id, round-trips for React keys. Service echoes/normalizes it.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string

  @IsString()
  @IsIn(CAPITAL_GROUPS)
  group!: string

  @IsString()
  @MaxLength(200)
  label!: string

  @IsNumber()
  actual!: number

  @IsNumber()
  budget!: number

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string
}

/** PUT .../capital-schedule body — bulk-replaces the whole items array. */
export class SaveCapitalScheduleDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CapitalItemDto)
  items!: CapitalItemDto[]
}
