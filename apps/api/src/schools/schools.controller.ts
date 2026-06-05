import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { SchoolsService } from './schools.service.js'
import { CreateSchoolDto } from './dto/create-school.dto.js'
import { CreateInvitationDto } from './dto/create-invitation.dto.js'
import { AcceptInvitationDto } from './dto/accept-invitation.dto.js'

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

  @Post('schools/:schoolId/invitations')
  @UseGuards(RolesGuard)
  @Roles('owner')
  createInvitation(
    @Param('schoolId') schoolId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.schools.createInvitation(schoolId, dto)
  }

  @Post('invitations/accept')
  acceptInvitation(@CurrentUser() user: User, @Body() dto: AcceptInvitationDto) {
    return this.schools.acceptInvitation(user, dto.token)
  }
}
