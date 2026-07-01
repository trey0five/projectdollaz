import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { AccreditationService } from './accreditation.service.js'

/**
 * Phase 4 Accreditation — the "attach from operations" DISCOVERY route. Enumerates the
 * caller-school's internal operational artifacts (v1: policies + board reports) so the
 * FE can offer one-click evidence attach. Its own controller because the base path
 * (`schools/:schoolId/accreditation/evidence-sources`) sits BESIDE, not under, the
 * nested `/standards/:standardId/evidence` route.
 *
 * Same guard chain + @RequiresModule('accreditation') as the standards controller; the
 * service filters both queries by the path schoolId, so only the caller-school's
 * artifacts are ever returned. All roles may READ (read-only discovery).
 */
@Controller('schools/:schoolId/accreditation/evidence-sources')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class EvidenceSourcesController {
  constructor(private readonly accreditation: AccreditationService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.accreditation.listEvidenceSources(schoolId)
  }
}
