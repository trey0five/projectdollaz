import { IsIn, IsObject, IsString } from 'class-validator'

/** A user-confirmed assistant proposal to apply. Mirrors ProposedAction. */
export class ApplyActionDto {
  @IsIn(['set_budget', 'draft_cap_entry', 'apply_driver_budget', 'set_explanation'])
  kind!: 'set_budget' | 'draft_cap_entry' | 'apply_driver_budget' | 'set_explanation'

  @IsString()
  periodId!: string

  @IsString()
  summary!: string

  @IsObject()
  payload!: Record<string, unknown>
}
