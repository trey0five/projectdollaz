import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { WorkpapersService } from './workpapers.service.js'

/**
 * Phase 2C — Year-End Workpapers Packet. Aggregates the period's snapshot
 * statements (READ, not recomputed), the 2A findings, the 2B reconciliation, the
 * 2D CAP, and the checklist rollup into one packet payload. Same guard stack as
 * the rest of the ComplianceModule; GET is open to all roles. Tenant-isolated via
 * getOwnedPeriod inside the service.
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class WorkpapersController {
  constructor(private readonly workpapers: WorkpapersService) {}

  @Get('periods/:periodId/workpapers')
  @Roles('owner', 'accountant', 'viewer')
  get(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
  ) {
    return this.workpapers.getPacket(schoolId, periodId)
  }
}
