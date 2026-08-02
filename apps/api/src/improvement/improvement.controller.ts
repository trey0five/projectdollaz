import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  HttpStatus,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { ImprovementService, ADOPT_REUSED } from './improvement.service.js'
import { CreateImprovementInitiativeDto } from './dto/create-improvement-initiative.dto.js'
import { UpdateImprovementInitiativeDto } from './dto/update-improvement-initiative.dto.js'
import { AdoptRecommendationDto } from './dto/adopt-recommendation.dto.js'
import { RecordProgressDto } from './dto/record-progress.dto.js'

/**
 * AIC Phase G — the Continuous Improvement Manager's routes.
 *
 * THE GATE IS **OR**, AND THERE IS NO THIRD SKU. `@RequiresModule('accreditation',
 * 'strategy')` admits a school that licenses EITHER, because improvement work is
 * how a school responds to what those two modules tell it — it is not a separate
 * product. There is deliberately no `improvement` module key, and a spec asserts
 * `MODULE_KEYS` never gains one.
 *
 * `keys[0]` is `'accreditation'`, so a finance-only school's 402 carries
 * `module: 'accreditation'` and the web's existing single-key `moduleKeyFromError`
 * keeps working untouched.
 *
 * The guard chain, the ParseUUIDPipe and the READ/WRITE role split are byte-for-byte
 * the house pattern: reads open to viewer, every write excludes them.
 */
@Controller('schools/:schoolId/improvement')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation', 'strategy')
export class ImprovementController {
  constructor(private readonly improvement: ImprovementService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.improvement.getImprovement(schoolId)
  }

  @Get('recommendations')
  @Roles('owner', 'accountant', 'viewer')
  recommendations(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.improvement.getRecommendations(schoolId)
  }

  @Post('initiatives')
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateImprovementInitiativeDto,
    @CurrentUser() user: User,
  ) {
    return this.improvement.createInitiative(schoolId, dto, user.id)
  }

  @Patch('initiatives/:initiativeId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('initiativeId', ParseUUIDPipe) initiativeId: string,
    @Body() dto: UpdateImprovementInitiativeDto,
    @CurrentUser() user: User,
  ) {
    return this.improvement.updateInitiative(schoolId, initiativeId, dto, user.id)
  }

  @Delete('initiatives/:initiativeId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('initiativeId', ParseUUIDPipe) initiativeId: string,
    @CurrentUser() user: User,
  ) {
    return this.improvement.removeInitiative(schoolId, initiativeId, user.id)
  }

  /**
   * Idempotent: adopting the same recommendation twice returns the SAME initiative.
   *
   * AND IT ANSWERS 200, NOT 201, ON THE SECOND CALL. Nest defaults every @Post to
   * 201 Created; a client that reads the status literally — or simply toasts
   * "Created" — would tell the user it made a second commitment it did not make.
   * The response BODY is identical either way; only the code differs.
   */
  @Post('adopt')
  @Roles('owner', 'accountant')
  async adopt(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: AdoptRecommendationDto,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.improvement.adopt(schoolId, dto, user.id)
    if ((result as Record<symbol, unknown>)[ADOPT_REUSED]) res.status(HttpStatus.OK)
    return result
  }

  @Post('initiatives/:initiativeId/progress')
  @Roles('owner', 'accountant')
  recordProgress(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('initiativeId', ParseUUIDPipe) initiativeId: string,
    @Body() dto: RecordProgressDto,
    @CurrentUser() user: User,
  ) {
    return this.improvement.recordProgress(schoolId, initiativeId, dto, user.id)
  }
}
