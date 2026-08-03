import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { VisitService } from './visit.service.js'
import { VisitQueryDto } from './dto/visit-query.dto.js'

/**
 * AIC Phase H — the MOCK VISIT route. One GET, and nothing else.
 *
 * The house chain in full: JwtAuthGuard → RolesGuard → EntitlementGuard, plus
 * `@RequiresModule('accreditation')`, `@Param('schoolId', ParseUUIDPipe)` and a
 * fully-decorated query DTO. An unlicensed school gets 402 MODULE_NOT_LICENSED
 * from the guard and never reaches the composer.
 *
 * VIEWER READS. A board member is exactly the audience for "what would a visiting
 * team find?", and there is no write route on this controller at all — adoption
 * goes through Phase G's existing, already-idempotent
 * POST /schools/:schoolId/improvement/adopt. Phase H adds NO write endpoint, no
 * bulk endpoint and no new DTO to keep in sync with the ProposedAction/APPLY_KINDS
 * quintet, which has 400'd /apply twice in this repo.
 */
@Controller('schools/:schoolId/accreditation')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class VisitController {
  constructor(private readonly visit: VisitService) {}

  /** The whole Mock Visit: six acts and the executive summary. */
  @Get('visit')
  @Roles('owner', 'accountant', 'viewer')
  getVisit(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query() query: VisitQueryDto,
  ) {
    return this.visit.getVisit(schoolId, query)
  }
}
