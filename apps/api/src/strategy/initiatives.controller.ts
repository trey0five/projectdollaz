import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { StrategyService } from './strategy.service.js'
import { CreateInitiativeDto } from './dto/create-initiative.dto.js'
import { UpdateInitiativeDto } from './dto/update-initiative.dto.js'

/** Phase 5 Strategic Planning — the INITIATIVES controller. Same guard chain +
 *  entitlement as PlansController; owner/accountant WRITE only. */
@Controller('schools/:schoolId/strategy')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('strategy')
export class InitiativesController {
  constructor(private readonly strategy: StrategyService) {}

  @Post('goals/:goalId/initiatives')
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() dto: CreateInitiativeDto,
    @CurrentUser() user: User,
  ) {
    return this.strategy.createInitiative(schoolId, goalId, dto, user.id)
  }

  @Patch('initiatives/:initiativeId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('initiativeId', ParseUUIDPipe) initiativeId: string,
    @Body() dto: UpdateInitiativeDto,
    @CurrentUser() user: User,
  ) {
    return this.strategy.updateInitiative(schoolId, initiativeId, dto, user.id)
  }

  @Delete('initiatives/:initiativeId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('initiativeId', ParseUUIDPipe) initiativeId: string,
    @CurrentUser() user: User,
  ) {
    return this.strategy.removeInitiative(schoolId, initiativeId, user.id)
  }
}
