import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'

const CHECKLIST_STATUSES = ['pending', 'done', 'na'] as const

/**
 * One editable checklist item keyed by itemId (a built id 'chk_<ruleId>' |
 * 'doc_<slug>'). status is restricted to the three-value enum (re-validated in the
 * service); notes is length-bounded and an explicit null clears it (distinct from
 * omitted, which keeps). The service additionally rejects any itemId that is not a
 * known built id (400).
 */
export class ChecklistItemUpsertDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  itemId!: string

  @IsOptional()
  @IsIn(CHECKLIST_STATUSES)
  status?: (typeof CHECKLIST_STATUSES)[number]

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null
}

/** PUT body: a mergeable set of checklist item states. */
export class UpsertChecklistDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemUpsertDto)
  items!: ChecklistItemUpsertDto[]
}
