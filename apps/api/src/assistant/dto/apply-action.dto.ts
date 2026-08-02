import { IsIn, IsObject, IsString } from 'class-validator'

// Keep this list in SYNC with the ProposedAction['kind'] union in assistant.service.ts
// — a missing kind makes /apply 400 at the validation boundary before applyAction runs.
const APPLY_KINDS = [
  'set_budget',
  'draft_cap_entry',
  'apply_driver_budget',
  'set_explanation',
  'apply_forecast',
  'set_feeder_enrollment',
  'import_trial_balance',
  'import_monthly_actuals',
  'import_diocesan_enrollment',
  'create_task',
  'submit_for_approval',
  'decide_approval',
  'file_document',
  'create_policy',
  'create_committee',
  'create_meeting',
  'create_standard',
  'create_maintenance_item',
  'create_campaign',
  'create_alert',
  'invite_member',
  'create_strategy_plan',
  'create_strategy_pillar',
  'create_strategy_goal',
  // DEPRECATED ALIAS. Kept BYTE-IDENTICAL: goal-bound, goalId required. Removing
  // it would 400 any proposal a client is still holding.
  'create_strategy_initiative',
  // AIC Phase G — the Continuous Improvement Manager's initiative, whose goalId is
  // OPTIONAL. Added here in the SAME change as the ProposedAction['kind'] union,
  // REFRESH, REVERSIBLE_KINDS and TOOL_LABELS: a kind present in the union but
  // missing from this list 400s at the validation boundary before applyAction ever
  // runs, and that exact desync has shipped twice.
  'create_initiative',
  'draft_strategy_plan',
] as const

/** A user-confirmed assistant proposal to apply. Mirrors ProposedAction. */
export class ApplyActionDto {
  @IsIn(APPLY_KINDS)
  kind!: (typeof APPLY_KINDS)[number]

  @IsString()
  periodId!: string

  @IsString()
  summary!: string

  @IsObject()
  payload!: Record<string, unknown>
}
