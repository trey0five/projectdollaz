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
import { ProfessionalDevelopmentService } from './professional-development.service.js'
import {
  CreateProfessionalDevelopmentDto,
  ListProfessionalDevelopmentQueryDto,
  UpdateProfessionalDevelopmentDto,
} from './dto/professional-development.dto.js'

/**
 * AIC Phase K — the PROFESSIONAL-DEVELOPMENT register.
 *
 * Same chain and same role split as the other two HR registers: the register
 * names staff and what they attended, so viewer 403s and gets `/summary` —
 * counts and a participation rate, no name.
 *
 * ROUTE-ORDER HAZARD: `@Get('summary')` MUST stay declared BEFORE `@Get(':pdId')`.
 */
@Controller('schools/:schoolId/hr/professional-development')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('hr')
export class ProfessionalDevelopmentController {
  constructor(private readonly pd: ProfessionalDevelopmentService) {}

  /** The register itself — NAMES PEOPLE. owner/accountant only; viewer 403s. */
  @Get()
  @Roles('owner', 'accountant')
  list(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query() query: ListProfessionalDevelopmentQueryDto,
  ) {
    return this.pd.list(schoolId, query)
  }

  /** COUNTS ONLY — the one PD surface a viewer may read. */
  @Get('summary')
  @Roles('owner', 'accountant', 'viewer')
  summary(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.pd.summary(schoolId)
  }

  @Get(':pdId')
  @Roles('owner', 'accountant')
  get(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('pdId', ParseUUIDPipe) pdId: string,
  ) {
    return this.pd.get(schoolId, pdId)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateProfessionalDevelopmentDto,
    @CurrentUser() user: User,
  ) {
    return this.pd.create(schoolId, dto, user.id)
  }

  @Patch(':pdId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('pdId', ParseUUIDPipe) pdId: string,
    @Body() dto: UpdateProfessionalDevelopmentDto,
    @CurrentUser() user: User,
  ) {
    return this.pd.update(schoolId, pdId, dto, user.id)
  }

  @Delete(':pdId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('pdId', ParseUUIDPipe) pdId: string,
    @CurrentUser() user: User,
  ) {
    return this.pd.remove(schoolId, pdId, user.id)
  }
}
