import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { ReportScheduleService } from './report-schedule.service.js'
import { UpsertScheduleDto } from './dto/upsert-schedule.dto.js'

/**
 * Phase 3 — recurring board-summary delivery config. Same guard stack as the
 * analytics controllers (membership-checked by RolesGuard on :schoolId). Reads
 * open to all roles; writes + "send now" are owner/accountant.
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class ReportScheduleController {
  constructor(private readonly schedule: ReportScheduleService) {}

  @Get('report-schedule')
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId') schoolId: string) {
    return this.schedule.get(schoolId)
  }

  @Put('report-schedule')
  @Roles('owner', 'accountant')
  upsert(
    @Param('schoolId') schoolId: string,
    @Body() dto: UpsertScheduleDto,
    @CurrentUser() user: User,
  ) {
    return this.schedule.upsert(schoolId, dto, user.id)
  }

  @Post('report-schedule/send-now')
  @Roles('owner', 'accountant')
  sendNow(@Param('schoolId') schoolId: string, @CurrentUser() user: User) {
    return this.schedule.sendNow(schoolId, user.id)
  }
}
