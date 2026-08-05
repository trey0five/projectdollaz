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
import { ClearancesService } from './clearances.service.js'
import {
  CreateClearanceDto,
  ImportClearancesDto,
  ListClearancesQueryDto,
  UpdateClearanceDto,
} from './dto/clearance.dto.js'

/**
 * AIC Phase K — the SAFE-ENVIRONMENT CLEARANCE register.
 *
 * The house guard chain in full, and the STRICTEST role split in the product:
 * VIEWER IS DENIED THE REGISTER OUTRIGHT. A row here says a named adult's
 * background check is or is not current, which is more sensitive than the
 * evaluation register and considerably more sensitive than anything else KYRO
 * holds. A board viewer gets `/summary` — counts only, no id, no name — which is
 * also what the web KPI card binds to for EVERY role, so there is one code path
 * rather than a role-dependent one that can drift.
 *
 * ROUTE-ORDER HAZARD: `@Get('summary')` MUST stay declared BEFORE
 * `@Get(':clearanceId')`. Nest matches in declaration order, so with the literal
 * second, ParseUUIDPipe would 400 on the string 'summary' and the one route a
 * viewer can call would be dead.
 */
@Controller('schools/:schoolId/hr/clearances')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('hr')
export class ClearancesController {
  constructor(private readonly clearances: ClearancesService) {}

  /** The register itself — NAMES PEOPLE. owner/accountant only; viewer 403s. */
  @Get()
  @Roles('owner', 'accountant')
  list(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query() query: ListClearancesQueryDto,
  ) {
    return this.clearances.list(schoolId, query)
  }

  /** COUNTS ONLY — the one clearance surface a viewer may read. */
  @Get('summary')
  @Roles('owner', 'accountant', 'viewer')
  summary(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.clearances.summary(schoolId)
  }

  /**
   * The per-diocese import. Idempotent on re-upload: (school, person, kind,
   * issuedOn) is a database unique index, so the same file twice updates rather
   * than duplicates, and a RENEWAL is correctly a new row.
   */
  @Post('import')
  @Roles('owner', 'accountant')
  import(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: ImportClearancesDto,
    @CurrentUser() user: User,
  ) {
    return this.clearances.importRows(schoolId, dto.rows, user.id)
  }

  @Get(':clearanceId')
  @Roles('owner', 'accountant')
  get(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('clearanceId', ParseUUIDPipe) clearanceId: string,
  ) {
    return this.clearances.get(schoolId, clearanceId)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateClearanceDto,
    @CurrentUser() user: User,
  ) {
    return this.clearances.create(schoolId, dto, user.id)
  }

  @Patch(':clearanceId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('clearanceId', ParseUUIDPipe) clearanceId: string,
    @Body() dto: UpdateClearanceDto,
    @CurrentUser() user: User,
  ) {
    return this.clearances.update(schoolId, clearanceId, dto, user.id)
  }

  @Delete(':clearanceId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('clearanceId', ParseUUIDPipe) clearanceId: string,
    @CurrentUser() user: User,
  ) {
    return this.clearances.remove(schoolId, clearanceId, user.id)
  }
}
