import { IsIn, IsObject, IsString } from 'class-validator'

/** A user-confirmed assistant proposal to apply. Mirrors ProposedAction. */
export class ApplyActionDto {
  @IsIn([
    'set_budget',
    'draft_cap_entry',
    'apply_driver_budget',
    'set_explanation',
    'apply_forecast',
    'set_feeder_enrollment',
  ])
  kind!:
    | 'set_budget'
    | 'draft_cap_entry'
    | 'apply_driver_budget'
    | 'set_explanation'
    | 'apply_forecast'
    | 'set_feeder_enrollment'

  @IsString()
  periodId!: string

  @IsString()
  summary!: string

  @IsObject()
  payload!: Record<string, unknown>
}
