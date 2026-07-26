import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { GovernanceReportService } from './governance-report.service.js'

/**
 * Governance Phase 2 — the accreditation-ready governance REPORT route. One
 * viewer-readable GET (board packets/site visits are read artifacts), same guard
 * stack + 'governance' gate as every other governance route. Compute-only —
 * the service composes live Prisma reads; nothing is stored.
 */
@Controller('schools/:schoolId/governance/report')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('governance')
export class GovernanceReportController {
  constructor(private readonly report: GovernanceReportService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.report.report(schoolId)
  }
}
