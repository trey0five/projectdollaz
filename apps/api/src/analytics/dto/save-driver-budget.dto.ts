// ─────────────────────────────────────────────────────────────
// PUT /schools/:schoolId/periods/:periodId/budget/driver — request DTO.
//
// The API runs a GLOBAL ValidationPipe with whitelist + forbidNonWhitelisted, so
// EVERY field the client PUTs must be declared here or the whole request 400s.
// Overrides is the trap: a freeform @IsObject would let an unknown key through
// unvalidated, so OverridesDto declares EACH RevenueKey/ExpenseKey explicitly.
// ─────────────────────────────────────────────────────────────
import { Type } from 'class-transformer'
import { IsNumber, IsObject, IsOptional, Max, Min, ValidateNested } from 'class-validator'

const MONEY = { min: -1_000_000_000_000, max: 1_000_000_000_000 }

/** Enrollment by grade — all 14 keys explicit, each a non-negative count. */
export class EnrollmentByGradeDto {
  @IsOptional() @IsNumber() @Min(0) @Max(100000) PK0?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100000) PK1?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100000) PK2?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100000) PK3?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100000) PK4?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100000) K?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100000) '1'?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100000) '2'?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100000) '3'?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100000) '4'?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100000) '5'?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100000) '6'?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100000) '7'?: number
  @IsOptional() @IsNumber() @Min(0) @Max(100000) '8'?: number
}

/** 4 tuition band rates. */
export class TuitionRatesDto {
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000) prek3?: number
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000) prek5?: number
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000) elem?: number
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000) middle?: number
}

/** 3-way program split percentages (normalized in compute; bounds only here). */
export class ProgramSplitDto {
  @IsNumber() @Min(0) @Max(100) parent!: number
  @IsNumber() @Min(0) @Max(100) ftc!: number
  @IsNumber() @Min(0) @Max(100) fes!: number
}

export class RoleStaffDto {
  @IsNumber() @Min(0) @Max(100000) count!: number
  @IsNumber() @Min(0) @Max(10_000_000) avgSalary!: number
}

export class StaffingDto {
  @ValidateNested() @Type(() => RoleStaffDto) teachers!: RoleStaffDto
  @ValidateNested() @Type(() => RoleStaffDto) admin!: RoleStaffDto
  @ValidateNested() @Type(() => RoleStaffDto) facilities!: RoleStaffDto
  @IsNumber() @Min(0) @Max(200) benefitsPct!: number
}

/** Per-category overrides — EVERY revenue+expense key declared (no freeform). */
export class OverridesDto {
  // Revenue keys
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) tuition?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) dev?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) studAct?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) textbook?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) other?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) support?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) intlRev?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) investments?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) interest?: number
  // Expense keys
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) instructional?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) facilities?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) fixedOther?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) intlExp?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) bus?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) food?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) studActExp?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) athletics?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) admin?: number
  @IsOptional() @IsNumber() @Min(MONEY.min) @Max(MONEY.max) restricted?: number
}

export class DriverAssumptionsDto {
  @IsObject() @ValidateNested() @Type(() => EnrollmentByGradeDto)
  enrollmentByGrade!: EnrollmentByGradeDto

  @IsObject() @ValidateNested() @Type(() => TuitionRatesDto)
  tuitionRates!: TuitionRatesDto

  @IsObject() @ValidateNested() @Type(() => ProgramSplitDto)
  tuitionProgramSplit!: ProgramSplitDto

  @IsNumber() @Min(0) @Max(1_000_000)
  feePerStudent!: number

  @IsObject() @ValidateNested() @Type(() => StaffingDto)
  staffing!: StaffingDto

  // Non-negative to match the form (its sanitizer blocks a leading '-').
  @IsNumber() @Min(0) @Max(1000)
  inflationPct!: number

  @IsOptional() @IsObject() @ValidateNested() @Type(() => OverridesDto)
  overrides?: OverridesDto
}

export class SaveDriverBudgetDto {
  @IsObject() @ValidateNested() @Type(() => DriverAssumptionsDto)
  assumptions!: DriverAssumptionsDto
}
