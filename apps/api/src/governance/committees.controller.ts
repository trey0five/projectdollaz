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
import { CreateCommitteeDto } from './dto/create-committee.dto.js'
import { UpdateCommitteeDto } from './dto/update-committee.dto.js'

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
  constructor(private readonly committees: CommitteesService) {}

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
}
