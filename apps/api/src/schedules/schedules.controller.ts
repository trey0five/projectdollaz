import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { SchedulesService } from './schedules.service.js'
import { SaveCapitalScheduleDto } from './dto/save-capital-schedule.dto.js'
import { SaveCashScheduleDto } from './dto/save-cash-schedule.dto.js'

/**
 * Phase 3 — Capital Budget + Cash & Investments supporting schedules. IDENTICAL
 * guard stack to BoardReportController: reads owner/accountant/viewer, writes
 * owner/accountant. Tenant isolation lives inside the service (getOwnedPeriod).
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  // ── Capital Budget Summary ──────────────────────────────────────────────────

  @Get('periods/:periodId/capital-schedule')
  @Roles('owner', 'accountant', 'viewer')
  getCapital(@Param('schoolId') schoolId: string, @Param('periodId') periodId: string) {
    return this.schedules.getCapitalSchedule(schoolId, periodId)
  }

  @Put('periods/:periodId/capital-schedule')
  @Roles('owner', 'accountant')
  saveCapital(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Body() dto: SaveCapitalScheduleDto,
    @CurrentUser() user: User,
  ) {
    return this.schedules.saveCapitalSchedule(schoolId, periodId, dto, user.id)
  }

  // ── Cash & Investments Summary ──────────────────────────────────────────────

  @Get('periods/:periodId/cash-schedule')
  @Roles('owner', 'accountant', 'viewer')
  getCash(@Param('schoolId') schoolId: string, @Param('periodId') periodId: string) {
    return this.schedules.getCashSchedule(schoolId, periodId)
  }

  @Put('periods/:periodId/cash-schedule')
  @Roles('owner', 'accountant')
  saveCash(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Body() dto: SaveCashScheduleDto,
    @CurrentUser() user: User,
  ) {
    return this.schedules.saveCashSchedule(schoolId, periodId, dto, user.id)
  }
}
