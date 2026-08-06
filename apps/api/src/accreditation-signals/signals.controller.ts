import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { AccreditationSignalsService } from './signals.service.js'
import { SignalsQueryDto } from './dto/signals-query.dto.js'

/**
 * AIC Phase B — the SIGNAL PANEL route: the real operating numbers bound to a
 * school's accreditation standards, each with the fiscal period it describes and
 * the timestamp its statements were generated, or an explicit reason it cannot
 * be shown.
 *
 * READ-ONLY for all three roles, behind the identical guard chain as
 * readiness.controller.ts, so tenancy resolves from `req.params.schoolId` and a
 * caller can only ever read the school in their own path. An unlicensed school
 * gets the existing 402 MODULE_NOT_LICENSED from EntitlementGuard.
 *
 * Note the ROUTE lives under /accreditation while the MODULE lives outside
 * AccreditationModule: this service needs AnalyticsService, and AnalyticsModule
 * already imports AccreditationModule, so the reverse edge would be circular.
 * Route paths are independent of module placement.
 */
@Controller('schools/:schoolId/accreditation/signals')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class AccreditationSignalsController {
  constructor(private readonly signals: AccreditationSignalsService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() query: SignalsQueryDto) {
    return this.signals.getSignals(schoolId, {
      periodId: query.periodId,
      frameworkId: query.frameworkId,
    })
  }
}
