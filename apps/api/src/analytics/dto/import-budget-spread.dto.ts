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
  // acct MAY be 0 for label-only sheets (account NAMES, no GL numbers): the
  // label is the identity and the server maps it via labelToCategory. Numeric
  // GL accounts stay in [100,9999]; @Min(0) lets the acct=0 sentinel through.
  @IsInt()
  @Min(0)
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

// ─────────────────────────────────────────────────────────────
// ASSESS body — Layer-1/Layer-2 budget sufficiency check. The body is ONE of
// two shapes: { spread } (reuses BudgetSpreadDto above) OR { draft } (category
// maps + optional stats). The global forbidNonWhitelisted pipe means EVERY
// top-level field must be declared; the service enforces the XOR.
// ─────────────────────────────────────────────────────────────

/** A finite-number map within ±max, capped at maxKeys keys. revenue/expense are
 * open-keyed (category-key → amount) so per-key class-validator decorators can't
 * apply; this custom validator keeps a malformed {x: NaN | "5" | {…}} out of the
 * pure function. Mirrors the IsNumberOrNullArray pattern above. */
function IsFiniteNumberMap(max: number, maxKeys: number, options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isFiniteNumberMap',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
          const entries = Object.entries(value as Record<string, unknown>)
          if (entries.length > maxKeys) return false
          return entries.every(
            ([, v]) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max,
          )
        },
        defaultMessage(): string {
          return `${propertyName} must be a map of finite numbers (within ±${max}, ≤${maxKeys} keys)`
        },
      },
    })
  }
}

/** Optional driver stats accompanying a draft assess. */
export class AssessDraftStatsDto {
  @IsOptional()
  @IsNumber()
  @Min(-1_000_000_000_000)
  @Max(1_000_000_000_000)
  salariesTotal?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  enrollmentTotal?: number

  @IsOptional()
  @IsNumber()
  @Min(-100_000)
  @Max(100_000)
  splitSum?: number

  @IsOptional()
  @IsIn(['driver', 'import'])
  source?: 'driver' | 'import'
}

/** A category-budget draft (driver or pre-mapped import) to assess. */
export class AssessDraftDto {
  @IsObject()
  @IsFiniteNumberMap(1_000_000_000_000, 200)
  revenue!: Record<string, number>

  @IsObject()
  @IsFiniteNumberMap(1_000_000_000_000, 200)
  expense!: Record<string, number>

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AssessDraftStatsDto)
  stats?: AssessDraftStatsDto
}

/** Request body for POST .../budget/assess — exactly one of spread|draft.
 * The XOR is enforced in the service (class-validator can't express it cleanly). */
export class AssessBudgetDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BudgetSpreadDto)
  spread?: BudgetSpreadDto

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AssessDraftDto)
  draft?: AssessDraftDto
}
