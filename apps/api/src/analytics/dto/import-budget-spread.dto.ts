import { Type } from 'class-transformer'
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  ValidateNested,
  type ValidationOptions,
} from 'class-validator'

/** Each element must be a finite number (within ±max) or null. class-validator
 * has no built-in "number|null, each" check, so register a small custom one. */
function IsNumberOrNullArray(max: number, options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isNumberOrNullArray',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (!Array.isArray(value)) return false
          return value.every(
            (v) => v === null || (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max),
          )
        },
        defaultMessage(): string {
          return `${propertyName} must be an array of numbers (or null) within ±${max}`
        },
      },
    })
  }
}

/**
 * One GL account row of a parsed budget spread. Parsing happens CLIENT-side in
 * the browser via @finrep/ingestion; the server re-validates the structure and
 * re-maps/re-rolls server-side (never trusts a client-supplied rollup total).
 * months are (number|null)[] (blank-vs-zero preserved); annual is verbatim.
 */
export class BudgetSpreadAccountDto {
  @IsInt()
  @Min(1)
  @Max(9999)
  acct!: number

  @IsString()
  @MaxLength(300)
  label!: string

  @IsArray()
  @ArrayMaxSize(24)
  @IsNumberOrNullArray(1_000_000_000_000)
  months!: (number | null)[]

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-1_000_000_000_000)
  @Max(1_000_000_000_000)
  annual!: number
}

export class BudgetSpreadSheetTotalsDto {
  @IsOptional()
  @IsNumber()
  revenue?: number | null

  @IsOptional()
  @IsNumber()
  expense?: number | null
}

/** Structurally-validated parsed BudgetSpread (subset the server actually uses). */
export class BudgetSpreadDto {
  @IsIn(['diocesan', 'generic'])
  format!: 'diocesan' | 'generic'

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sheetName?: string

  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  monthKeys!: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  monthLabels?: string[]

  @IsOptional()
  @IsString()
  fiscalYearStart?: string | null

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => BudgetSpreadAccountDto)
  accounts!: BudgetSpreadAccountDto[]

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BudgetSpreadSheetTotalsDto)
  sheetTotals?: BudgetSpreadSheetTotalsDto

  // Diagnostic fields the client parser also emits. The server ignores them but
  // they must be whitelisted, else the global forbidNonWhitelisted ValidationPipe
  // rejects the whole payload (400). @Allow passes them through unvalidated.
  @Allow()
  warnings?: string[]

  @Allow()
  headerRowIndex?: number

  @Allow()
  columns?: unknown

  @Allow()
  skippedRows?: unknown
}

/** Request body for PUT .../budget/spread. */
export class ImportBudgetSpreadDto {
  @IsObject()
  @ValidateNested()
  @Type(() => BudgetSpreadDto)
  spread!: BudgetSpreadDto

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string
}
