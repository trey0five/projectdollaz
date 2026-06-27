// ─────────────────────────────────────────────────────────────
// PUT /schools/:schoolId/periods/:periodId/budget/forecast — request DTO.
//
// FY-End Forecast = an assumption-driven RE-PROJECTION (computeDriverBudget with
// feeder enrollment merged in) compared to the active budget. The global
// ValidationPipe runs whitelist + forbidNonWhitelisted, so EVERY field must be
// declared or the request 400s. We REUSE the driver DTO's DriverAssumptionsDto
// and EnrollmentByGradeDto verbatim, and enumerate every revenue/expense key in
// the per-line explanations map (mirroring OverridesDto — NO @Allow free-form).
// ─────────────────────────────────────────────────────────────
import { Type } from 'class-transformer'
import { IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator'
import { DriverAssumptionsDto, EnrollmentByGradeDto } from './save-driver-budget.dto.js'

const MAX_EXPLANATION_CHARS = 2000

/**
 * Per-line forecast comments, keyed by revenue/expense category. Every key is
 * declared explicitly (no freeform) so a typo'd key 400s rather than slipping
 * through. Each value is an optional string clamped to 2000 chars.
 */
export class ExplanationMapDto {
  // Revenue keys
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) tuition?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) dev?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) studAct?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) textbook?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) other?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) support?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) intlRev?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) investments?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) interest?: string
  // Expense keys
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) instructional?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) facilities?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) fixedOther?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) intlExp?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) bus?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) food?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) studActExp?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) athletics?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) admin?: string
  @IsOptional() @IsString() @MaxLength(MAX_EXPLANATION_CHARS) restricted?: string
}

/** Forecast comments split by category type. */
export class ForecastExplanationsDto {
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ExplanationMapDto)
  revenue?: ExplanationMapDto

  @IsOptional() @IsObject() @ValidateNested() @Type(() => ExplanationMapDto)
  expense?: ExplanationMapDto
}

export class SaveForecastDto {
  /** Revised driver assumptions (PRE-feeder). Reused verbatim from the driver DTO. */
  @IsObject() @ValidateNested() @Type(() => DriverAssumptionsDto)
  assumptions!: DriverAssumptionsDto

  /**
   * Anticipated incoming feeder students by grade (net-new, additive). Optional;
   * when present the server ALSO persists it through to the operational row so the
   * two never disagree. When omitted the server reads the operational row's feeder.
   */
  @IsOptional() @IsObject() @ValidateNested() @Type(() => EnrollmentByGradeDto)
  feederEnrollmentByGrade?: EnrollmentByGradeDto | null

  /** Per-line forecast comments (separate from the Board Report's explanations). */
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ForecastExplanationsDto)
  explanations?: ForecastExplanationsDto
}
