import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { StaffEvaluationsService } from './staff-evaluations.service.js'
import {
  CreateStaffEvaluationDto,
  ListStaffEvaluationsQueryDto,
  UpdateStaffEvaluationDto,
} from './dto/staff-evaluation.dto.js'

/**
 * AIC Phase F — the STAFF EVALUATION register routes.
 *
 * The house chain in full: JwtAuthGuard (401) → RolesGuard (403) → EntitlementGuard
 * (402), plus `@RequiresModule('hr')`, `@Param(…, ParseUUIDPipe)` on every id and a
 * fully-decorated DTO on every body and query (the global `forbidNonWhitelisted` pipe
 * 400s anything else). An unlicensed school gets 402 MODULE_NOT_LICENSED and loses
 * NOTHING it has today — this register did not exist before this phase.
 *
 * VIEWER IS DENIED THE REGISTER OUTRIGHT, and that is deliberate. It is stricter than
 * governance/facilities/advancement, all of which let a viewer read. This register is
 * ADULT-STAFF EMPLOYMENT PII: a row names an individual employee and says their
 * evaluation is late. A board viewer has no business reading that. What a viewer gets
 * instead is `/summary` — COUNTS ONLY, no id, no personId, no name — which is also
 * what the web KPI card binds to for EVERY role, so there is one code path rather
 * than a role-dependent one that could drift.
 *
 * ROUTE-ORDER HAZARD: `@Get('summary')` MUST stay declared BEFORE
 * `@Get(':evaluationId')`. Nest matches in declaration order, so with the literal
 * second, ParseUUIDPipe would 400 on the string 'summary' and the one route a viewer
 * can call would be dead.
 */
@Controller('schools/:schoolId/hr/staff-evaluations')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('hr')
export class StaffEvaluationsController {
  constructor(private readonly evaluations: StaffEvaluationsService) {}

  /** The register itself — NAMES PEOPLE. owner/accountant only; viewer 403s. */
  @Get()
  @Roles('owner', 'accountant')
  list(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query() query: ListStaffEvaluationsQueryDto,
  ) {
    return this.evaluations.list(schoolId, query)
  }

  /** COUNTS ONLY — the one staff-evaluation surface a viewer may read. */
  @Get('summary')
  @Roles('owner', 'accountant', 'viewer')
  summary(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.evaluations.summary(schoolId)
  }

  @Get(':evaluationId')
  @Roles('owner', 'accountant')
  get(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('evaluationId', ParseUUIDPipe) evaluationId: string,
  ) {
    return this.evaluations.get(schoolId, evaluationId)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateStaffEvaluationDto,
    @CurrentUser() user: User,
  ) {
    return this.evaluations.create(schoolId, dto, user.id)
  }

  @Patch(':evaluationId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('evaluationId', ParseUUIDPipe) evaluationId: string,
    @Body() dto: UpdateStaffEvaluationDto,
    @CurrentUser() user: User,
  ) {
    return this.evaluations.update(schoolId, evaluationId, dto, user.id)
  }

  @Delete(':evaluationId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('evaluationId', ParseUUIDPipe) evaluationId: string,
    @CurrentUser() user: User,
  ) {
    return this.evaluations.remove(schoolId, evaluationId, user.id)
  }
}
