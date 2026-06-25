import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { BudgetService } from './budget.service.js'
import { UpsertBudgetDto } from './dto/upsert-budget.dto.js'
import { ImportBudgetSpreadDto } from './dto/import-budget-spread.dto.js'

/**
 * Phase 3 budget intake. Same guard stack as OperationalController: reads open to
 * all roles, writes owner/accountant. Tenant-isolated via getOwnedPeriod.
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  @Get('periods/:periodId/budget')
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId') schoolId: string, @Param('periodId') periodId: string) {
    return this.budget.get(schoolId, periodId)
  }

  @Put('periods/:periodId/budget')
  @Roles('owner', 'accountant')
  upsert(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Body() dto: UpsertBudgetDto,
    @CurrentUser() user: User,
  ) {
    return this.budget.upsert(schoolId, periodId, dto, user.id)
  }

  /** Import a parsed budget spread (re-mapped + re-rolled server-side). */
  @Put('periods/:periodId/budget/spread')
  @Roles('owner', 'accountant')
  importSpread(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Body() dto: ImportBudgetSpreadDto,
    @CurrentUser() user: User,
  ) {
    return this.budget.upsertSpread(schoolId, periodId, dto, user.id)
  }
}
