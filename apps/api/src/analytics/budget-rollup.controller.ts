import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { BudgetRollupService } from './budget-rollup.service.js'
import { BudgetRollupQueryDto } from './dto/budget-rollup-query.dto.js'

/**
 * Diocese-wide budget roll-up. JwtAuthGuard ONLY — this mirrors the org-scoped
 * read pattern in OrganizationsController (RolesGuard can't resolve a schoolId
 * for an org route, and EntitlementGuard gates only paid WRITES + would 402 with
 * no school context). Org isolation is enforced in the service via the caller's
 * active memberships (no cross-org leakage). Read-only aggregate.
 */
@Controller('organizations/:orgId')
@UseGuards(JwtAuthGuard)
export class BudgetRollupController {
  constructor(private readonly rollup: BudgetRollupService) {}

  @Get('budget/rollup')
  getRollup(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Query() query: BudgetRollupQueryDto,
  ) {
    return this.rollup.getRollup(user, orgId, query.fiscalYearStart ?? null)
  }
}
