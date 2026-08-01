import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { EarlyWarningService } from './early-warning.service.js'
import { TwinQueryDto } from './dto/twin-query.dto.js'
import { AckFindingDto } from './dto/ack-finding.dto.js'
import { MuteFindingDto } from './dto/mute-finding.dto.js'
import { FindingStatusDto } from './dto/finding-status.dto.js'

/**
 * AIC Phase E — the EARLY WARNING routes.
 *
 * The house chain in full: JwtAuthGuard → RolesGuard → EntitlementGuard, plus
 * `@RequiresModule('accreditation')`, `@Param('schoolId', ParseUUIDPipe)` and a
 * fully-decorated DTO on every body and query (the global `forbidNonWhitelisted`
 * pipe 400s anything else). An unlicensed school gets 402 MODULE_NOT_LICENSED
 * from the guard — it never reaches the engine, so a school that has not bought
 * the module cannot even learn how many rules exist.
 *
 * READ IS FOR EVERYONE, WRITE IS NOT. `viewer` may GET: a board member is exactly
 * the audience for "what would a visiting team find?", and the payload is
 * outcome-voiced by construction. `viewer` may not ack, mute or close — those are
 * management decisions with a 45-day consequence, and the ledger records who made
 * them.
 */
@Controller('schools/:schoolId/accreditation')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class TwinController {
  constructor(private readonly earlyWarning: EarlyWarningService) {}

  /** The whole twin: findings, the holes, coverage, per-standard risk, ten bands. */
  @Get('twin')
  @Roles('owner', 'accountant', 'viewer')
  getTwin(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query() query: TwinQueryDto,
  ) {
    return this.earlyWarning.getTwin(schoolId, query)
  }

  /** "Seen — come back in 45 days." Not a resolution; there is no route that pretends it is. */
  @Post('findings/:findingId/ack')
  @Roles('owner', 'accountant')
  ack(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('findingId', ParseUUIDPipe) findingId: string,
    @Body() dto: AckFindingDto,
    @CurrentUser() user: User,
  ) {
    return this.earlyWarning.ack(schoolId, findingId, dto, user.id)
  }

  /** Mute for N days with a stated reason; `days: 0` unmutes. */
  @Post('findings/:findingId/mute')
  @Roles('owner', 'accountant')
  mute(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('findingId', ParseUUIDPipe) findingId: string,
    @Body() dto: MuteFindingDto,
    @CurrentUser() user: User,
  ) {
    return this.earlyWarning.mute(schoolId, findingId, dto, user.id)
  }

  /** The human status transition — the ONLY writer of `status` in the system. */
  @Post('findings/:findingId/status')
  @Roles('owner', 'accountant')
  setStatus(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('findingId', ParseUUIDPipe) findingId: string,
    @Body() dto: FindingStatusDto,
    @CurrentUser() user: User,
  ) {
    return this.earlyWarning.setStatus(schoolId, findingId, dto, user.id)
  }
}
