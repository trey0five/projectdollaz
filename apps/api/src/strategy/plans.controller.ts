import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { StrategyService } from './strategy.service.js'
import { CreatePlanDto } from './dto/create-plan.dto.js'
import { UpdatePlanDto } from './dto/update-plan.dto.js'

/**
 * Phase 5 Strategic Planning — the PLANS controller (+ the computed reads). The 7th
 * licensable module: class-level @RequiresModule('strategy') makes the shared
 * EntitlementGuard emit 402 { code:'MODULE_NOT_LICENSED', module:'strategy' } for an
 * entitled-but-unlicensed school (a trial school gets all-access → passes). Guard
 * ORDER matches the app: JwtAuthGuard (401) → RolesGuard (403) → EntitlementGuard
 * (402). All roles READ; owner/accountant WRITE. Tenant isolation lives in the service.
 */
@Controller('schools/:schoolId/strategy')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('strategy')
export class PlansController {
  constructor(private readonly strategy: StrategyService) {}

  @Get('plans')
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.strategy.listPlans(schoolId)
  }

  /** The COMPUTED payload for the school's ACTIVE plan (briefing/Penny/hero read this). */
  @Get('active/progress')
  @Roles('owner', 'accountant', 'viewer')
  activeProgress(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.strategy.getActivePlanComputed(schoolId)
  }

  @Get('plans/:planId')
  @Roles('owner', 'accountant', 'viewer')
  get(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
  ) {
    return this.strategy.getPlan(schoolId, planId)
  }

  /** The COMPUTED payload for a specific plan. */
  @Get('plans/:planId/progress')
  @Roles('owner', 'accountant', 'viewer')
  progress(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
  ) {
    return this.strategy.getPlanProgress(schoolId, planId)
  }

  @Post('plans')
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreatePlanDto,
    @CurrentUser() user: User,
  ) {
    return this.strategy.createPlan(schoolId, dto, user.id)
  }

  @Patch('plans/:planId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: User,
  ) {
    return this.strategy.updatePlan(schoolId, planId, dto, user.id)
  }

  @Delete('plans/:planId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: User,
  ) {
    return this.strategy.removePlan(schoolId, planId, user.id)
  }
}
