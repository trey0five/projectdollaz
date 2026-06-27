import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { DataHubService } from './data-hub.service.js'

/**
 * Unified Data hub status. Guard stack verbatim from OperationalController
 * (JwtAuthGuard 401 -> RolesGuard 403 -> EntitlementGuard 402). Read-only, open to
 * all roles. Tenant isolation is enforced inside the service via getOwnedPeriod
 * (throws 404 before any read). No request body -> no DTO / ValidationPipe.
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class DataHubController {
  constructor(private readonly dataHub: DataHubService) {}

  @Get('periods/:periodId/data-status')
  @Roles('owner', 'accountant', 'viewer')
  status(@Param('schoolId') schoolId: string, @Param('periodId') periodId: string) {
    return this.dataHub.status(schoolId, periodId)
  }
}
