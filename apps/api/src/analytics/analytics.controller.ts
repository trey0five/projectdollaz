import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import type { MembershipRole, User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CallerRole } from '../common/decorators/caller-role.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { METRIC_META } from '@finrep/analytics'
import { AnalyticsService } from './analytics.service.js'
import { InsightService } from './insight.service.js'
import { BriefingService } from './briefing.service.js'
import { BriefingQueryDto } from './dto/briefing-query.dto.js'

/**
 * Phase 4A analytics reads. Tenant-isolated by RolesGuard (must be an active
 * member of :schoolId); ALL roles (owner/accountant/viewer) may read. Gated by
 * the SAME Phase-1D EntitlementGuard as generate/save — a non-entitled school
 * (lapsed trial / inactive sub) gets 402 SUBSCRIPTION_REQUIRED.
 *
 * Guard order: JwtAuthGuard (401) -> RolesGuard (403) -> EntitlementGuard (402),
 * so auth/role failures precede the payment gate.
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly insights: InsightService,
    private readonly briefing: BriefingService,
  ) {}

  // All metrics for a period (snapshot + prior period for PoP deltas). The
  // response carries per-metric status/inputs + a freshness block (Phase 4D).
  @Get('periods/:periodId/metrics')
  @Roles('owner', 'accountant', 'viewer')
  metrics(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.analytics.metricsForPeriod(schoolId, periodId)
  }

  // The prioritised attention briefing for a period: a RANKED, explainable list
  // of off-band metrics + readiness gaps + data gaps synthesised from the existing
  // services (no recompute). Read-auth = any active member, same as /metrics.
  // Graceful: a period with no snapshot returns a single "get started" item (200).
  //
  // Scope × Lens: the briefing is role-SHAPED. The caller's resolved role (from
  // RolesGuard, query-free) is the default lens AND the ceiling. An optional
  // ?lens=<role> previews a NARROWER lens (server clamps; never widens). Same
  // figures, role-correct emphasis/inclusion/voice — additive to the response.
  @Get('periods/:periodId/briefing')
  @Roles('owner', 'accountant', 'viewer')
  briefingForPeriod(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @CallerRole() callerRole: MembershipRole | undefined,
    @CurrentUser() user: User,
    @Query() query: BriefingQueryDto,
  ) {
    // Fail safe to the most restrictive lens if the guard somehow didn't attach
    // a role (it always does on this @Roles() route).
    const role: MembershipRole = callerRole ?? 'viewer'
    // BLOCKER: the caller-scoped "awaiting your sign-off" item is keyed off the
    // SERVER-authenticated user.id ONLY — never a client-supplied id.
    return this.briefing.getBriefing(schoolId, periodId, role, query.lens, user.id)
  }

  // The static metric catalog metadata (formula/description/bands). No recompute.
  @Get('metrics/meta')
  @Roles('owner', 'accountant', 'viewer')
  meta() {
    return { metrics: METRIC_META }
  }

  // AI insight summary for a period: rule-based by default, optional Claude
  // upgrade. Same guards (entitlement-gated) — never throws on LLM errors.
  @Get('periods/:periodId/insights')
  @Roles('owner', 'accountant', 'viewer')
  insightsForPeriod(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.insights.insightFor(schoolId, periodId)
  }

  // Builder context for a period's budget: prior-year category actuals, the
  // multi-year history series, and enrollment/aid drivers (driver-based tuition).
  @Get('periods/:periodId/budget-context')
  @Roles('owner', 'accountant', 'viewer')
  budgetContext(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
  ) {
    return this.analytics.budgetContext(schoolId, periodId)
  }

  // A single metric's trend across the school's periods.
  @Get('metrics/trends')
  @Roles('owner', 'accountant', 'viewer')
  trends(
    @Param('schoolId') schoolId: string,
    @Query('metric') metric: string,
  ) {
    return this.analytics.trends(schoolId, metric)
  }
}
