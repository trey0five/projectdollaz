import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { ComplianceInputsService } from './compliance-inputs.service.js'
import { UpsertComplianceInputsDto } from './dto/upsert-compliance-inputs.dto.js'

/**
 * Phase 2A compliance intake CRUD (mirrors the 4B OperationalController). Same
 * guard stack/order as AnalyticsController (JwtAuthGuard 401 -> RolesGuard 403 ->
 * EntitlementGuard 402). Reads open to all roles; writes are owner/accountant.
 * Tenant-isolated via getOwnedPeriod inside the service.
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class ComplianceInputsController {
  constructor(private readonly inputs: ComplianceInputsService) {}

  @Get('periods/:periodId/compliance/inputs')
  @Roles('owner', 'accountant', 'viewer')
  get(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
  ) {
    return this.inputs.get(schoolId, periodId)
  }

  @Put('periods/:periodId/compliance/inputs')
  @Roles('owner', 'accountant')
  upsert(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Body() dto: UpsertComplianceInputsDto,
    @CurrentUser() user: User,
  ) {
    return this.inputs.upsert(schoolId, periodId, dto, user.id)
  }
}
