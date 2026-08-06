import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { AccreditationCommendationsService } from './commendations.service.js'
import { SignalsQueryDto } from './dto/signals-query.dto.js'

/**
 * AIC Phase C — the COMMENDATIONS route: the strengths this school can defend,
 * meaning all three of a strong self-score, current evidence and a favorable
 * operating figure. Zero commendations is a legitimate answer and the payload
 * explains itself with the exclusion counts.
 *
 * READ-ONLY for all three roles, identical guard chain to the signal panel it
 * sits beside. Lives in AccreditationSignalsModule because it needs
 * AnalyticsService (via the panel) as well as the currency service.
 */
@Controller('schools/:schoolId/accreditation/commendations')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class AccreditationCommendationsController {
  constructor(private readonly commendations: AccreditationCommendationsService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() query: SignalsQueryDto) {
    return this.commendations.getCommendations(schoolId, {
      periodId: query.periodId,
      frameworkId: query.frameworkId,
    })
  }
}
