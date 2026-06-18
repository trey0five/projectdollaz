import { Type } from 'class-transformer'
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'

/** Mirrors @finrep/engine NormalizedRow { acct:number(int), desc, total }. */
export class ImportRowDto {
  @IsInt()
  acct!: number

  @IsString()
  desc!: string

  @IsNumber({ allowInfinity: false, allowNaN: false })
  total!: number
}

/**
 * Store an IMMUTABLE import (rows JSONB snapshot). Create-or-gets the period from
 * (periodEndDate, periodType). Re-uploading the same (period, role) inserts a NEW
 * import; the latest is the active one (append-only, never updated).
 */
export class CreateImportDto {
  @IsIn(['cy', 'py', 'audit'])
  role!: 'cy' | 'py' | 'audit'

  @IsISO8601()
  periodEndDate!: string

  @IsString()
  @MaxLength(40)
  periodType!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string

  @IsString()
  @MaxLength(255)
  sourceName!: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[]

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}
