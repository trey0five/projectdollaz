import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { FacilitiesBudgetService } from './facilities-budget.service.js'
import { UpdateFacilitiesBudgetConfigDto } from './dto/facilities-budget-config.dto.js'

/**
 * Facilities inherited budget — the READ-ONLY facilities view of the Finance
 * PeriodBudget (no facilities-side budget entry exists anywhere). Same guard
 * chain as the register. GET is open to all roles; the mapping config PUT is
 * owner/accountant (the web hides the gear from viewers; the 403 is the server
 * truth).
 */
@Controller('schools/:schoolId/facilities/budget')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('facilities')
export class FacilitiesBudgetController {
  constructor(private readonly budget: FacilitiesBudgetService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  get(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('periodId', new ParseUUIDPipe({ optional: true })) periodId?: string,
  ) {
    return this.budget.getBudget(schoolId, periodId)
  }

  @Put('config')
  @Roles('owner', 'accountant')
  putConfig(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: UpdateFacilitiesBudgetConfigDto,
    @CurrentUser() user: User,
  ) {
    return this.budget.putConfig(schoolId, dto.keys, user.id)
  }
}
