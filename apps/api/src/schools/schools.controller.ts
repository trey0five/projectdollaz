import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { SchoolsService } from './schools.service.js'
import { CreateSchoolDto } from './dto/create-school.dto.js'
import { CreateInvitationDto } from './dto/create-invitation.dto.js'
import { AcceptInvitationDto } from './dto/accept-invitation.dto.js'
import { UpdateMemberRoleDto } from './dto/update-member-role.dto.js'
import { UpdateSchoolDto } from './dto/update-school.dto.js'

@Controller()
@UseGuards(JwtAuthGuard)
export class SchoolsController {
  constructor(private readonly schools: SchoolsService) {}

  @Post('schools')
  createSchool(@CurrentUser() user: User, @Body() dto: CreateSchoolDto) {
    return this.schools.createSchool(user, dto)
  }

  @Get('schools')
  listSchools(@CurrentUser() user: User) {
    return this.schools.listSchools(user)
  }

  @Get('schools/:schoolId/members')
  @UseGuards(RolesGuard)
  @Roles('owner', 'accountant')
  listMembers(@Param('schoolId') schoolId: string) {
    return this.schools.listMembers(schoolId)
  }

  @Patch('schools/:schoolId/members/:userId')
  @UseGuards(RolesGuard)
  @Roles('owner')
  changeMemberRole(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.schools.changeMemberRole(user, schoolId, userId, dto.role)
  }

  @Delete('schools/:schoolId/members/:userId')
  @UseGuards(RolesGuard)
  @Roles('owner')
  removeMember(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Param('userId') userId: string,
  ) {
    return this.schools.removeMember(user, schoolId, userId)
  }

  @Patch('schools/:schoolId')
  @UseGuards(RolesGuard)
  @Roles('owner')
  updateSchool(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Body() dto: UpdateSchoolDto,
  ) {
    return this.schools.updateSchool(user, schoolId, dto, 'owner')
  }

  @Get('schools/:schoolId/invitations')
  @UseGuards(RolesGuard)
  @Roles('owner', 'accountant')
  listInvitations(@Param('schoolId') schoolId: string) {
    return this.schools.listPendingInvitations(schoolId)
  }

  @Post('schools/:schoolId/invitations')
  @UseGuards(RolesGuard)
  @Roles('owner')
  createInvitation(
    @Param('schoolId') schoolId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.schools.createInvitation(schoolId, dto)
  }

  @Delete('schools/:schoolId/invitations/:invitationId')
  @UseGuards(RolesGuard)
  @Roles('owner')
  revokeInvitation(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.schools.revokeInvitation(user, schoolId, invitationId)
  }

  @Post('invitations/accept')
  acceptInvitation(@CurrentUser() user: User, @Body() dto: AcceptInvitationDto) {
    return this.schools.acceptInvitation(user, dto.token)
  }
}
