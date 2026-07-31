import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { AccreditationReadinessHistoryService } from './readiness-history.service.js'
import {
  ReadinessDiffQueryDto,
  ReadinessTrendQueryDto,
} from './dto/readiness-trend-query.dto.js'

/**
 * Accreditation Intelligence Phase A — the readiness HISTORY routes.
 *
 * READ-ONLY for all three roles, behind the identical guard chain as
 * readiness.controller.ts, so tenancy resolves from `req.params.schoolId` and a
 * caller can only ever read the school in their own path. An unlicensed school
 * gets the existing 402 MODULE_NOT_LICENSED from EntitlementGuard — unchanged.
 *
 * NOTE the route segment 'trend' is a URL only. Phase A reports OBSERVED CHANGE
 * between recorded readings; no payload field, copy string or reason produced by
 * these endpoints claims a statistical direction over time.
 */
@Controller('schools/:schoolId/accreditation/readiness')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class AccreditationReadinessHistoryController {
  constructor(private readonly history: AccreditationReadinessHistoryService) {}

  /** Which series exist for this school, and which one to show first. */
  @Get('series')
  @Roles('owner', 'accountant', 'viewer')
  getSeries(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.history.getSeries(schoolId)
  }

  /** The recorded points, the observed change, its decomposition, and the breaks. */
  @Get('trend')
  @Roles('owner', 'accountant', 'viewer')
  getTrend(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query() query: ReadinessTrendQueryDto,
  ) {
    return this.history.getTrend(schoolId, query)
  }

  /** Standard-by-standard: what actually moved between two recorded readings. */
  @Get('diff')
  @Roles('owner', 'accountant', 'viewer')
  getDiff(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query() query: ReadinessDiffQueryDto,
  ) {
    return this.history.getDiff(schoolId, query)
  }
}
