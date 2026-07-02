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
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { MeetingsService } from './meetings.service.js'
import { CreateMeetingDto } from './dto/create-meeting.dto.js'
import { UpdateMeetingDto } from './dto/update-meeting.dto.js'

/**
 * Phase 3 Governance depth — the MEETING register controller. Rides the SAME
 * 'governance' module gate as the Policy Register + Committees (@RequiresModule →
 * 402 MODULE_NOT_LICENSED unlicensed). Guard ORDER: JwtAuthGuard (401) → RolesGuard
 * (403) → EntitlementGuard (402). All roles READ; owner/accountant WRITE (incl. the
 * approve-minutes action). Tenant isolation + the committeeId same-school check
 * live in the service. ParseUUIDPipe → bad UUID 400.
 */
@Controller('schools/:schoolId/governance/meetings')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('governance')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.meetings.listMeetings(schoolId)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateMeetingDto,
    @CurrentUser() user: User,
  ) {
    return this.meetings.create(schoolId, dto, user.id)
  }

  @Patch(':meetingId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: UpdateMeetingDto,
    @CurrentUser() user: User,
  ) {
    return this.meetings.update(schoolId, meetingId, dto, user.id)
  }

  @Post(':meetingId/approve-minutes')
  @Roles('owner', 'accountant')
  approveMinutes(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser() user: User,
  ) {
    return this.meetings.approveMinutes(schoolId, meetingId, user.id)
  }

  @Delete(':meetingId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser() user: User,
  ) {
    return this.meetings.remove(schoolId, meetingId, user.id)
  }
}
