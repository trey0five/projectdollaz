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
import { CommitteesService } from './committees.service.js'
import { PeopleService } from './people.service.js'
import { CreateCommitteeDto } from './dto/create-committee.dto.js'
import { UpdateCommitteeDto } from './dto/update-committee.dto.js'
import { AddMemberDto, UpdateMemberDto } from './dto/person.dto.js'

/**
 * Phase 3 Governance depth — the COMMITTEE register controller. Rides the SAME
 * 'governance' module gate as the Policy Register (@RequiresModule → the shared
 * EntitlementGuard emits 402 MODULE_NOT_LICENSED for an unlicensed school). Guard
 * ORDER matches the app: JwtAuthGuard (401) → RolesGuard (403) → EntitlementGuard
 * (402). All roles READ; owner/accountant WRITE. Tenant isolation lives in the
 * service. ParseUUIDPipe → bad UUID 400.
 */
@Controller('schools/:schoolId/governance/committees')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('governance')
export class CommitteesController {
  constructor(
    private readonly committees: CommitteesService,
    // Phase 2 — membership routes are COMMITTEE-CENTRIC (they live here) but ALL
    // membership persistence lives in PeopleService (the frozen split).
    private readonly people: PeopleService,
  ) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.committees.list(schoolId)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateCommitteeDto,
    @CurrentUser() user: User,
  ) {
    return this.committees.create(schoolId, dto, user.id)
  }

  @Patch(':committeeId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('committeeId', ParseUUIDPipe) committeeId: string,
    @Body() dto: UpdateCommitteeDto,
    @CurrentUser() user: User,
  ) {
    return this.committees.update(schoolId, committeeId, dto, user.id)
  }

  @Delete(':committeeId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('committeeId', ParseUUIDPipe) committeeId: string,
    @CurrentUser() user: User,
  ) {
    return this.committees.remove(schoolId, committeeId, user.id)
  }

  // ── Phase 2 — committee MEMBERSHIP (people register join) ───────────────────

  @Get(':committeeId/members')
  @Roles('owner', 'accountant', 'viewer')
  listMembers(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('committeeId', ParseUUIDPipe) committeeId: string,
  ) {
    return this.people.listMembers(schoolId, committeeId)
  }

  @Post(':committeeId/members')
  @Roles('owner', 'accountant')
  addMember(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('committeeId', ParseUUIDPipe) committeeId: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: User,
  ) {
    return this.people.addMember(schoolId, committeeId, dto, user.id)
  }

  @Patch(':committeeId/members/:membershipId')
  @Roles('owner', 'accountant')
  updateMember(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('committeeId', ParseUUIDPipe) committeeId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: User,
  ) {
    return this.people.updateMemberRole(schoolId, committeeId, membershipId, dto, user.id)
  }

  @Delete(':committeeId/members/:membershipId')
  @Roles('owner', 'accountant')
  removeMember(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('committeeId', ParseUUIDPipe) committeeId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentUser() user: User,
  ) {
    return this.people.removeMember(schoolId, committeeId, membershipId, user.id)
  }
}
