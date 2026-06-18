import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { OperationalService } from './operational.service.js'
import { UpsertOperationalDto } from './dto/upsert-operational.dto.js'

/**
 * Phase 4B operational-data intake. Same guard stack/order as AnalyticsController
 * (JwtAuthGuard 401 -> RolesGuard 403 -> EntitlementGuard 402). Reads are open to
 * all roles; writes are owner/accountant only. Tenant-isolated via getOwnedPeriod
 * inside the service.
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class OperationalController {
  constructor(private readonly operational: OperationalService) {}

  @Get('periods/:periodId/operational')
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId') schoolId: string, @Param('periodId') periodId: string) {
    return this.operational.get(schoolId, periodId)
  }

  @Put('periods/:periodId/operational')
  @Roles('owner', 'accountant')
  upsert(
    @Param('schoolId') schoolId: string,
    @Param('periodId') periodId: string,
    @Body() dto: UpsertOperationalDto,
    @CurrentUser() user: User,
  ) {
    return this.operational.upsert(schoolId, periodId, dto, user.id)
  }
}
