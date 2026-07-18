import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { OrgMetricsService } from './org-metrics.service.js'
import { StatementsRollupQueryDto } from './dto/statements-rollup-query.dto.js'
import { PeerBenchmarkQueryDto } from './dto/peer-benchmark-query.dto.js'

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

  /**
   * Phase D COMPARE surface — per-school registry metrics for the FY. ZERO
   * recompute: the service reuses getMetrics' resolution but runs the per-school
   * engine (computeMetricsForPeriod) per contributing school, school-scoped
   * entitlement-gated + registry-formatted. Same JwtAuthGuard-only posture and
   * the SAME reused query DTO (single optional fiscalYearStart, YYYY-MM).
   */
  @Get('metrics/by-school')
  getMetricsBySchool(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Query() query: StatementsRollupQueryDto,
  ) {
    return this.orgMetrics.getMetricsBySchool(user, orgId, query.fiscalYearStart ?? null)
  }

  /**
   * School Comparison — internal peer benchmarking for ONE owned school. Same
   * JwtAuthGuard-only posture (org isolation enforced in the service). Peers are
   * grouped by size/county/district/type/grade with a relaxation ladder; the
   * response carries the focus standing, the peer distribution, and insights.
   */
  @Get('metrics/peers/:schoolId')
  getPeerBenchmark(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Param('schoolId') schoolId: string,
    @Query() query: PeerBenchmarkQueryDto,
  ) {
    return this.orgMetrics.getPeerBenchmark(user, orgId, schoolId, {
      fiscalYearStart: query.fiscalYearStart ?? null,
      dims: query.dims,
      minPeers: query.minPeers,
    })
  }
}
