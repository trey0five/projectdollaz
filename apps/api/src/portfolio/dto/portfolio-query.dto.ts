import { IsIn, IsOptional, IsString, Matches } from 'class-validator'
import type { Lens } from '../../analytics/briefing-lens.js'

/**
 * AIC Phase I — the superintendent portfolio query.
 *
 * NOTE WHAT IS NOT HERE, and that its absence is the feature: there is no `sort`,
 * `orderBy`, `direction`, `rankBy` or `asOf`. The comparator is server-frozen
 * (attention band → urgency → attention score → verifiedPct → name → schoolId),
 * which is how "no cross-framework index ranking is reachable in the API" becomes
 * a mechanical property rather than a promise, and `now` is server-supplied so a
 * client cannot move the clock under a determinism claim.
 *
 * The global forbidNonWhitelisted pipe means anything not declared here 400s — so
 * a client that tries to add `?sortBy=index` is refused at the boundary rather
 * than silently ignored.
 */
export class PortfolioQueryDto {
  /**
   * Restrict the portfolio to ONE accreditation framework, by code. A mixed-
   * framework diocese is fully supported without this (the response reports
   * `indexComparable: false` and one band distribution per framework); this is for
   * a superintendent who wants to look at just the Cognia schools.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,40}$/, { message: 'frameworkCode has an unexpected shape' })
  frameworkCode?: string

  /** Scope × Lens override. The server CLAMPS to the caller's org ceiling. */
  @IsOptional()
  @IsIn(['owner', 'accountant', 'viewer'], {
    message: 'lens must be owner, accountant, or viewer',
  })
  lens?: Lens
}
