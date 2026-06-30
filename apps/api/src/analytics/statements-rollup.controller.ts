import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { StatementsRollupService } from './statements-rollup.service.js'
import { StatementsRollupQueryDto } from './dto/statements-rollup-query.dto.js'

/**
 * Organization-wide CONSOLIDATED financial statements roll-up. JwtAuthGuard ONLY —
 * this mirrors BudgetRollupController's org-scoped read pattern (RolesGuard can't
 * resolve a schoolId for an org route, and EntitlementGuard gates only paid WRITES
 * + would 402 with no school context). Org isolation is enforced in the service via
 * the caller's active memberships (no cross-org leakage). Read-only aggregate.
 *
 * A second @Controller('organizations/:orgId') class alongside BudgetRollupController
 * is valid in Nest because the sub-paths differ (budget/rollup vs statements/rollup).
 */
@Controller('organizations/:orgId')
@UseGuards(JwtAuthGuard)
export class StatementsRollupController {
  constructor(private readonly rollup: StatementsRollupService) {}

  @Get('statements/rollup')
  getRollup(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Query() query: StatementsRollupQueryDto,
  ) {
    return this.rollup.getRollup(user, orgId, query.fiscalYearStart ?? null)
  }
}
