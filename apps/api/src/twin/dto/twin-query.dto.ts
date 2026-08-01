import { Transform } from 'class-transformer'
import { IsBoolean, IsIn, IsOptional } from 'class-validator'
import { TWIN_RULE_IDS } from '@finrep/compliance'
import { FINDING_SEVERITIES, type FindingSeverity } from '../finding-vocab.js'

/**
 * AIC Phase E — the /twin read filter.
 *
 * EVERY field is decorated. The global `forbidNonWhitelisted` ValidationPipe 400s
 * an undecorated query key, which is the house rule and is why this DTO exists at
 * all rather than a loose `Record<string, string>`.
 *
 * `ruleId` is validated against `TWIN_RULE_IDS` — the pure package's frozen id
 * array, not a re-typed copy. A rule renamed in the engine 400s here on the next
 * build instead of silently filtering to nothing.
 */
export class TwinQueryDto {
  @IsOptional()
  @IsIn(FINDING_SEVERITIES as unknown as string[])
  severity?: FindingSeverity

  @IsOptional()
  @IsIn(TWIN_RULE_IDS as unknown as string[])
  ruleId?: string

  /**
   * Include findings whose rule has STOPPED firing (the `cleared[]` list) and
   * findings a human has resolved or dismissed. Off by default: a cleared finding
   * is history, and history does not belong in a list of what is wrong today.
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeCleared?: boolean
}
