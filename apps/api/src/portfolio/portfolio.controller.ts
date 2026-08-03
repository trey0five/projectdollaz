import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { PortfolioService } from './portfolio.service.js'
import { PortfolioBulkAdoptService } from './bulk-adopt.service.js'
import { PortfolioQueryDto } from './dto/portfolio-query.dto.js'
import { PortfolioStandardsQueryDto } from './dto/portfolio-standards-query.dto.js'
import { VelocityQueryDto } from './dto/velocity-query.dto.js'
import { BulkAdoptDto } from './dto/bulk-adopt.dto.js'

/**
 * AIC Phase I — the SUPERINTENDENT PORTFOLIO routes.
 *
 * `JwtAuthGuard` ONLY, and that is deliberate rather than lax. It is the same
 * pattern every org-scoped controller in this codebase already uses
 * (OrgBriefingController, StatementsRollupController, OrgMetricsController):
 *   • `RolesGuard` resolves a role from a `schoolId` route/param, and an ORG route
 *     has none — it would either throw or silently pass;
 *   • `EntitlementGuard` resolves a licence from a school context, and would 402
 *     the whole diocese because there is no single school to check.
 *
 * ORG ISOLATION AND PER-SCHOOL ENTITLEMENT ARE ENFORCED IN THE SERVICE, against
 * the caller's active memberships and per-school `BillingService` checks — which
 * is the only place they CAN be enforced correctly for a payload that spans forty
 * schools with forty different licences. Spec API-2 asserts the guard list is
 * exactly `[JwtAuthGuard]` so that a well-meaning "hardening" pass cannot turn
 * this into a 500 or a blanket 402.
 *
 * The WRITE route's authorization (owner/accountant at EVERY target school) is
 * likewise a service check, made for the whole batch before the first write.
 *
 * A further `@Controller('organizations/:orgId')` class is valid in Nest because
 * the sub-paths differ (accreditation/portfolio, improvement/velocity, …).
 */
@Controller('organizations/:orgId')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(
    private readonly portfolio: PortfolioService,
    private readonly bulkAdopt: PortfolioBulkAdoptService,
  ) {}

  /** Which schools need attention, why in words, and which we cannot honestly rank. */
  @Get('accreditation/portfolio')
  getPortfolio(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Query() query: PortfolioQueryDto,
  ) {
    return this.portfolio.getPortfolio(user, orgId, query)
  }

  /** One diocesan workshop rather than nine school projects. */
  @Get('accreditation/portfolio/standards')
  getStandards(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Query() query: PortfolioStandardsQueryDto,
  ) {
    return this.portfolio.getInterventionPriorities(user, orgId, query)
  }

  /** Is the improvement work already adopted actually moving? */
  @Get('improvement/velocity')
  getVelocity(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Query() query: VelocityQueryDto,
  ) {
    return this.portfolio.getVelocity(user, orgId, query)
  }

  /**
   * Propose → confirm. `propose` writes nothing and is therefore a POST that is
   * safe to repeat; `confirm` rides Phase G's already-idempotent adopt, so
   * repeating IT creates nothing either. 200 on both: neither mode is guaranteed
   * to have created a resource, and answering 201 for a call that reused fourteen
   * existing initiatives would tell the client it made commitments it did not make.
   */
  @Post('improvement/bulk-adopt')
  @HttpCode(200)
  postBulkAdopt(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Body() dto: BulkAdoptDto,
  ) {
    return this.bulkAdopt.bulkAdopt(user, orgId, dto)
  }
}
