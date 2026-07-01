import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { SearchService } from './search.service.js'
import { SearchQueryDto } from './dto/search-query.dto.js'

/**
 * Phase 4 Knowledge/Search v1 — platform-wide search.
 *
 * The route is CORE: guarded by JwtAuthGuard (401) → RolesGuard (403) →
 * EntitlementGuard (402 SUBSCRIPTION_REQUIRED for a wholly-unentitled school) but
 * carries NO @RequiresModule — an entitled school of ANY licensed mix can reach it.
 * The per-DOMAIN entitlement gate lives INSIDE SearchService (a finance-only school
 * finds only tasks; governance/accreditation/facilities are never queried).
 *
 * All read roles may search (read-only cross-cut, mirrors evidence-sources). The
 * schoolId is ParseUUIDPipe-validated (bad UUID → 400) and is the SOLE tenant key
 * passed to every downstream query.
 */
@Controller('schools/:schoolId/search')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  find(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() query: SearchQueryDto) {
    return this.search.search(schoolId, query.q)
  }
}
