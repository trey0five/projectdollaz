import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { PeopleService } from './people.service.js'
import { CreatePersonDto, ListPeopleQueryDto, UpdatePersonDto } from './dto/person.dto.js'

/**
 * Governance Phase 2 — the PEOPLE register controller (person CRUD + detail).
 * Rides the SAME 'governance' module gate as the other governance registers
 * (@RequiresModule → 402 MODULE_NOT_LICENSED for an unlicensed school). Guard
 * ORDER matches the app: JwtAuthGuard (401) → RolesGuard (403) → EntitlementGuard
 * (402). All roles READ; owner/accountant WRITE. Tenant isolation lives in the
 * service. ParseUUIDPipe → bad UUID 400.
 */
@Controller('schools/:schoolId/governance/people')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('governance')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query() query: ListPeopleQueryDto,
  ) {
    return this.people.list(schoolId, query)
  }

  @Get(':personId')
  @Roles('owner', 'accountant', 'viewer')
  detail(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('personId', ParseUUIDPipe) personId: string,
  ) {
    return this.people.detail(schoolId, personId)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreatePersonDto,
    @CurrentUser() user: User,
  ) {
    return this.people.create(schoolId, dto, user.id)
  }

  @Patch(':personId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('personId', ParseUUIDPipe) personId: string,
    @Body() dto: UpdatePersonDto,
    @CurrentUser() user: User,
  ) {
    return this.people.update(schoolId, personId, dto, user.id)
  }

  @Delete(':personId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('personId', ParseUUIDPipe) personId: string,
    @CurrentUser() user: User,
  ) {
    return this.people.remove(schoolId, personId, user.id)
  }
}
