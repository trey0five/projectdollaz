import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { BudgetService } from './budget.service.js'
import { UpsertBudgetDto } from './dto/upsert-budget.dto.js'
import { ImportBudgetSpreadDto, AssessBudgetDto } from './dto/import-budget-spread.dto.js'
import { SaveDriverBudgetDto } from './dto/save-driver-budget.dto.js'
import { SaveForecastDto } from './dto/save-forecast.dto.js'

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

  /**
   * Apply a Phase-2 DRIVER MODEL: recompute the category budget authoritatively
   * from { assumptions } and overwrite lines.revenue/expense + lines.spread so
   * Monthly Spread / Budget-vs-Actual / Organizational Roll-up all reflect it.
   */
  @Put('periods/:periodId/budget/driver')
  @Roles('owner', 'accountant')
  applyDriver(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Body() dto: SaveDriverBudgetDto,
    @CurrentUser() user: User,
  ) {
    return this.budget.upsertDriver(schoolId, periodId, dto, user.id)
  }

  /**
   * GET the saved FY-End FORECAST envelope (forecast object + live feeder + flags).
   */
  @Get('periods/:periodId/budget/forecast')
  @Roles('owner', 'accountant', 'viewer')
  getForecast(@Param('schoolId') schoolId: string, @Param('periodId') periodId: string) {
    return this.budget.getForecast(schoolId, periodId)
  }

  /**
   * Save / recompute the FY-End FORECAST: re-project from { assumptions } with
   * feeder enrollment merged additively, compare against the active budget for
   * per-category variance, and store lines.forecast WITHOUT clobbering the budget.
   */
  @Put('periods/:periodId/budget/forecast')
  @Roles('owner', 'accountant')
  saveForecast(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Body() dto: SaveForecastDto,
    @CurrentUser() user: User,
  ) {
    return this.budget.upsertForecast(schoolId, periodId, dto, user.id)
  }

  /**
   * ADVISORY budget sufficiency check. Read-only (no persistence) so ALL roles
   * may call it; tenant-isolated via getOwnedPeriod inside the service. Body is
   * exactly one of { spread } or { draft }. Never blocks Apply/Confirm.
   */
  @Post('periods/:periodId/budget/assess')
  @Roles('owner', 'accountant', 'viewer')
  assess(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Body() dto: AssessBudgetDto,
  ) {
    return this.budget.assess(schoolId, periodId, dto)
  }
}
