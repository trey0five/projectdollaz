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
import { PriorVisitService } from './prior-visit.service.js'
import {
  CreatePriorVisitFindingDto,
  ListPriorVisitFindingsQueryDto,
  UpdatePriorVisitFindingDto,
} from './dto/prior-visit.dto.js'

/**
 * AIC Phase F — the PRIOR VISIT FINDINGS routes.
 *
 * The house chain in full: JwtAuthGuard (401) → RolesGuard (403) → EntitlementGuard
 * (402), `@RequiresModule('accreditation')`, ParseUUIDPipe on every id, a decorated
 * DTO on every body and query. An unlicensed school gets 402 MODULE_NOT_LICENSED and
 * loses nothing it has today — this register did not exist before this phase.
 *
 * VIEWER MAY READ, unlike the staff-evaluation register next door. There is no
 * personal PII here — a citation names a STANDARD, not a person — and "the 2021 team
 * cited you here, and it is still open" is precisely the sentence a board member
 * should see. Writing stays with owner/accountant: transcribing a visiting team's
 * report, and declaring a citation closed, are management acts.
 */
@Controller('schools/:schoolId/accreditation/prior-visit-findings')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class PriorVisitController {
  constructor(private readonly priorVisit: PriorVisitService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query() query: ListPriorVisitFindingsQueryDto,
  ) {
    return this.priorVisit.list(schoolId, query)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreatePriorVisitFindingDto,
    @CurrentUser() user: User,
  ) {
    return this.priorVisit.create(schoolId, dto, user.id)
  }

  @Patch(':findingId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('findingId', ParseUUIDPipe) findingId: string,
    @Body() dto: UpdatePriorVisitFindingDto,
    @CurrentUser() user: User,
  ) {
    return this.priorVisit.update(schoolId, findingId, dto, user.id)
  }

  @Delete(':findingId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('findingId', ParseUUIDPipe) findingId: string,
    @CurrentUser() user: User,
  ) {
    return this.priorVisit.remove(schoolId, findingId, user.id)
  }
}
