import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator'

// ─────────────────────────────────────────────────────────────────────────────
// Granular diocesan enrollment — two-step org import DTOs. Every field decorated
// so the global forbidNonWhitelisted ValidationPipe accepts them; nested arrays go
// through @ValidateNested()+@Type().
// ─────────────────────────────────────────────────────────────────────────────

/** Step 1 upload — the file is @UploadedFile (not in the DTO); observedOn overrides
 *  the parser's derived as-of date. */
export class DiocesanUploadDto {
  @IsDateString()
  @IsOptional()
  observedOn?: string
}

/** Step 1 API-connect variant (dark / config-gated). */
export class DiocesanSyncDto {
  @IsDateString()
  @IsOptional()
  observedOn?: string

  @IsString()
  @IsOptional()
  connectorRef?: string
}

/** The reviewer's per-row override actions. */
export const ROW_DECISION_ACTIONS = ['match', 'skip', 'unmatch'] as const

/** PATCH one row's decision (persisted). */
export class RowDecisionDto {
  @IsIn(ROW_DECISION_ACTIONS)
  action!: (typeof ROW_DECISION_ACTIONS)[number]

  @IsUUID()
  @IsOptional()
  schoolId?: string

  @IsBoolean()
  @IsOptional()
  learnAlias?: boolean
}

/** One row's final decision inside an apply batch (merged over persisted state). */
export class RowDecisionInput {
  @IsUUID()
  rowId!: string

  @IsIn(ROW_DECISION_ACTIONS)
  action!: (typeof ROW_DECISION_ACTIONS)[number]

  @IsUUID()
  @IsOptional()
  schoolId?: string

  @IsBoolean()
  @IsOptional()
  learnAlias?: boolean
}

/** Step 2 apply — final per-row decisions merged over the persisted staging state. */
export class DiocesanApplyDto {
  @IsDateString()
  @IsOptional()
  observedOn?: string

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RowDecisionInput)
  rows?: RowDecisionInput[]
}
