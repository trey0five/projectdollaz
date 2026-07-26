import { ArrayNotEmpty, IsArray, IsIn, IsString } from 'class-validator'
import { EXPENSE_LINE_KEYS } from '@finrep/analytics'

/**
 * The facilities budget mapping — a checked SUBSET of the 10 canonical
 * PeriodBudget lines.expense keys (EXPENSE_LINE_KEYS from @finrep/analytics — the
 * ONE vocabulary; no regex/heuristics). A key outside the vocabulary 400s at the
 * pipe. The service dedupes while preserving order.
 */
export class UpdateFacilitiesBudgetConfigDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(EXPENSE_LINE_KEYS as readonly string[], { each: true })
  keys!: string[]
}
