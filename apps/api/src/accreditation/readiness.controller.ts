import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { AccreditationReadinessService } from './readiness.service.js'
import { ReadinessQueryDto } from './dto/readiness-query.dto.js'

/**
 * Accreditation Phase 3 — the READINESS route: rubric-blended readiness %,
 * Cognia-style projected index + status band, ranked improvement gaps, and the
 * binary assurance checklist. READ-ONLY (all three roles) — the same guard
 * chain + @RequiresModule('accreditation') as the standards controller.
 * Needs-attention entries are composed CLIENT-side from this payload (briefing
 * untouched this phase — frozen decision).
 */
@Controller('schools/:schoolId/accreditation/readiness')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class AccreditationReadinessController {
  constructor(private readonly readiness: AccreditationReadinessService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() query: ReadinessQueryDto) {
    return this.readiness.getReadiness(schoolId, {
      target: query.target,
      frameworkId: query.frameworkId,
    })
  }
}
