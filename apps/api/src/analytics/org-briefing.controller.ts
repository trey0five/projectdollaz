import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { OrgBriefingService } from './org-briefing.service.js'
import { OrgBriefingQueryDto } from './dto/org-briefing-query.dto.js'

/**
 * Organization-wide ATTENTION BRIEFING. JwtAuthGuard ONLY — mirrors
 * StatementsRollupController's org-scoped read pattern (RolesGuard can't resolve a
 * schoolId for an org route, and EntitlementGuard would 402 with no school
 * context). Org isolation is enforced in the service via the caller's active
 * memberships (no cross-org leakage). Read-only / advisory.
 *
 * A third @Controller('organizations/:orgId') class alongside BudgetRollupController
 * and StatementsRollupController is valid in Nest because the sub-paths differ
 * (budget/rollup vs statements/rollup vs briefing).
 */
@Controller('organizations/:orgId')
@UseGuards(JwtAuthGuard)
export class OrgBriefingController {
  constructor(private readonly orgBriefing: OrgBriefingService) {}

  @Get('briefing')
  getOrgBriefing(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Query() query: OrgBriefingQueryDto,
  ) {
    return this.orgBriefing.getOrgBriefing(user, orgId, query.fiscalYearStart ?? null)
  }
}
