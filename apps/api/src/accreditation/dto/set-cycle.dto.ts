import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator'

/**
 * WS3 F1 — PUT the school's cycle anchor (and the persisted hero target) for
 * one framework. forbidNonWhitelisted-SAFE: every field decorated. Explicit
 * `null` CLEARS a nullable field (the @IsOptional class-validator semantics);
 * omitted keeps the current value. `targetIndex` is additionally validated
 * against the framework's own index scale in the service — a bounds check
 * needs the framework row, which a DTO cannot see.
 */
export class SetCycleDto {
  @IsUUID()
  frameworkId!: string

  @IsOptional()
  @IsDateString()
  lastReviewDate?: string | null

  @IsOptional()
  @IsDateString()
  nextReviewDate?: string | null

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  termYears?: number

  @IsOptional()
  @IsInt()
  targetIndex?: number | null
}
