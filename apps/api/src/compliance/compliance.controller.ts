import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { ComplianceService } from './compliance.service.js'

/**
 * Phase 2A Review Readiness reads. Tenant-isolated by RolesGuard; ALL roles may
 * read. Gated by the same Phase-1D EntitlementGuard as analytics (402 when not
 * active/trialing). Guard order: JwtAuthGuard (401) -> RolesGuard (403) ->
 * EntitlementGuard (402).
 */
@Controller('schools/:schoolId')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get('periods/:periodId/compliance')
  @Roles('owner', 'accountant', 'viewer')
  evaluate(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
  ) {
    return this.compliance.evaluateForPeriod(schoolId, periodId)
  }
}
