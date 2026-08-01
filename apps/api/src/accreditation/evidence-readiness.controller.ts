import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { AccreditationEvidenceReadinessService } from './evidence-readiness.service.js'
import { EvidenceReadinessQueryDto } from './dto/evidence-readiness-query.dto.js'

/**
 * AIC Phase C — the EVIDENCE INDEX route: what a visiting team would ask this
 * school for, whether it exists, whether it is dated, and whether it is still
 * current — grouped by artifact rather than by standard, so one audit serving
 * nine standards appears once.
 *
 * READ-ONLY for all three roles, behind the identical guard chain as
 * readiness.controller.ts. This endpoint WRITES NOTHING: auto-satisfaction is a
 * live read of the register that already owns the artifact.
 */
@Controller('schools/:schoolId/accreditation/evidence-readiness')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class AccreditationEvidenceReadinessController {
  constructor(private readonly evidence: AccreditationEvidenceReadinessService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  get(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query() query: EvidenceReadinessQueryDto,
  ) {
    return this.evidence.getEvidenceReadiness(schoolId, { frameworkId: query.frameworkId })
  }
}
