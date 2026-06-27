import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { CASH_RESTRICTIONS } from '../schedule.constants.js'

/**
 * One bank/investment account. EVERY field decorated for the global
 * forbidNonWhitelisted ValidationPipe. interestRate is a PERCENT number
 * (4.25 = 4.25%), NOT a fraction — @Min(0) only, NO @Max. The server does NOT
 * enforce insuredPortion + uninsuredPortion === balance (summed independently).
 */
export class CashAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string

  @IsString()
  @IsIn(CASH_RESTRICTIONS)
  restriction!: string

  @IsString()
  @MaxLength(200)
  institution!: string

  @IsString()
  @MaxLength(200)
  accountDescription!: string

  @IsString()
  @MaxLength(200)
  vehicle!: string

  // Free text or YYYY-MM-DD; '' when none.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  maturity?: string

  // PERCENT (4.25 = 4.25%). NO @Max — a fraction interpretation would render 425%.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  interestRate?: number

  @IsNumber()
  @Min(0)
  balance!: number

  @IsNumber()
  @Min(0)
  insuredPortion!: number

  @IsNumber()
  @Min(0)
  uninsuredPortion!: number

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string
}

/** PUT .../cash-schedule body — bulk-replaces the whole accounts array. */
export class SaveCashScheduleDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CashAccountDto)
  accounts!: CashAccountDto[]
}
