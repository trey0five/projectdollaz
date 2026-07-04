import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { AlertService } from './alert.service.js'
import { CreateAlertDto } from './dto/create-alert.dto.js'
import { UpdateAlertDto } from './dto/update-alert.dto.js'

/**
 * Phase 4E — proactive alerts / standing requests. CORE feature (NO @RequiresModule),
 * same guard stack as ReportScheduleController: JwtAuthGuard (401) → RolesGuard (403,
 * membership-checked on :schoolId) → EntitlementGuard (402). Reads open to all roles;
 * create/edit/delete/test are owner/accountant. Tenant isolation lives in the service
 * (every mutating query resolves the row `where { id, schoolId }`).
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertService) {}

  @Get('alerts')
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.alerts.list(schoolId)
  }

  @Post('alerts')
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateAlertDto,
    @CurrentUser() user: User,
  ) {
    return this.alerts.create(schoolId, dto, user.id)
  }

  @Patch('alerts/:alertId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body() dto: UpdateAlertDto,
    @CurrentUser() user: User,
  ) {
    return this.alerts.update(schoolId, alertId, dto, user.id)
  }

  @Delete('alerts/:alertId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @CurrentUser() user: User,
  ) {
    return this.alerts.remove(schoolId, alertId, user.id)
  }

  @Post('alerts/:alertId/test')
  @Roles('owner', 'accountant')
  test(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @CurrentUser() user: User,
  ) {
    return this.alerts.evaluateNow(schoolId, alertId, user)
  }
}
