import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { AccreditationCatalogService } from './catalog.service.js'

/**
 * Accreditation Phase 3 — the FRAMEWORK CATALOG routes. GET lists the seeded
 * accreditor frameworks (Cognia/MSA-CESS/NSBECS) with the caller-school's
 * adoption facts; POST /:code/adopt copies a framework's catalog tree into the
 * school's standards register (idempotent — re-adopt fills gaps, never dupes).
 *
 * Same guard chain + @RequiresModule('accreditation') as the standards
 * controller. Reads: all three roles; adopt WRITES the register → owner/
 * accountant only. The adopt body is empty ({}); `code` is a catalog code, not
 * a UUID (no ParseUUIDPipe on it — unknown code 404s in the service).
 */
@Controller('schools/:schoolId/accreditation/frameworks')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class AccreditationCatalogController {
  constructor(private readonly catalog: AccreditationCatalogService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.catalog.listFrameworks(schoolId)
  }

  @Post(':code/adopt')
  @Roles('owner', 'accountant')
  adopt(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('code') code: string,
    @CurrentUser() user: User,
  ) {
    return this.catalog.adoptFramework(schoolId, code, user.id)
  }
}
