import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { DashboardService } from './dashboard.service.js'
import { SaveDashboardDto } from './dto/save-dashboard.dto.js'

/**
 * Phase 4C per-school dashboard customization. Same guard stack/order as the
 * other analytics controllers (JwtAuthGuard 401 -> RolesGuard 403 ->
 * EntitlementGuard 402). ALL roles read the configured/default layout; only
 * owners may mutate (PUT/DELETE), per the plan. Tenant-isolated by RolesGuard
 * membership on :schoolId.
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard')
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId') schoolId: string) {
    return this.dashboard.getLayout(schoolId)
  }

  @Put('dashboard')
  @Roles('owner')
  save(
    @Param('schoolId') schoolId: string,
    @Body() dto: SaveDashboardDto,
    @CurrentUser() user: User,
  ) {
    return this.dashboard.saveLayout(schoolId, dto.layout, user.id)
  }

  @Delete('dashboard')
  @Roles('owner')
  reset(@Param('schoolId') schoolId: string, @CurrentUser() user: User) {
    return this.dashboard.resetLayout(schoolId, user.id)
  }
}
