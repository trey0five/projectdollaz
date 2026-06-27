import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator'

/** Mirrors @finrep/engine NormalizedRow { acct:number(int), desc, total } — same shape as ImportRowDto. */
export class MonthlyRowDto {
  @IsInt()
  acct!: number

  @IsString()
  desc!: string

  @IsNumber({ allowInfinity: false, allowNaN: false })
  total!: number
}

/**
 * Store/replace a MONTHLY trial balance. A monthly TB is AS-OF month-END =
 * cumulative YTD within the fiscal year. monthKey is server-validated as
 * 'YYYY-MM' AND additionally checked to fall inside the target period's FY
 * (Jul–Jun) in the service. Re-uploading the same (period, monthKey) REPLACES
 * the row (upsert). All fields whitelisted for the global forbidNonWhitelisted
 * ValidationPipe.
 */
export class CreateMonthlySnapshotDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthKey must be YYYY-MM (month 01–12).' })
  monthKey!: string

  @IsString()
  @MaxLength(255)
  sourceName!: string

  @IsArray()
  @ArrayMaxSize(20000)
  @ValidateNested({ each: true })
  @Type(() => MonthlyRowDto)
  rows!: MonthlyRowDto[]
}
