import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { OrgMetricsService } from './org-metrics.service.js'
import { StatementsRollupQueryDto } from './dto/statements-rollup-query.dto.js'

/**
 * Canonical semantic layer v1 — organization-wide METRICS roll-up. JwtAuthGuard
 * ONLY, exactly like StatementsRollupController/OrgBriefingController: an org route
 * has no schoolId for RolesGuard to resolve, and EntitlementGuard gates only paid
 * WRITES. Org isolation is enforced in the service via the caller's active
 * memberships (no cross-org leakage). Read-only aggregate.
 *
 * A further @Controller('organizations/:orgId') class is valid in Nest because the
 * sub-path ('metrics') differs from statements/rollup, budget/rollup, briefing.
 *
 * The query DTO is REUSED verbatim from the statements rollup (single optional
 * fiscalYearStart, YYYY-MM) — already forbidNonWhitelisted-safe.
 */
@Controller('organizations/:orgId')
@UseGuards(JwtAuthGuard)
export class OrgMetricsController {
  constructor(private readonly orgMetrics: OrgMetricsService) {}

  @Get('metrics')
  getMetrics(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Query() query: StatementsRollupQueryDto,
  ) {
    return this.orgMetrics.getMetrics(user, orgId, query.fiscalYearStart ?? null)
  }
}
