import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { AccreditationService } from './accreditation.service.js'
import { CreateStandardDto } from './dto/create-standard.dto.js'
import { UpdateStandardDto } from './dto/update-standard.dto.js'

/**
 * Phase 4 Accreditation v1 — the STANDARDS register controller. The SECOND real
 * use of the per-module entitlement backbone (after governance): the class-level
 * @RequiresModule('accreditation') makes the shared EntitlementGuard emit a 402
 * { code:'MODULE_NOT_LICENSED', module:'accreditation' } for an entitled-but-
 * unlicensed school (trialing resolves like active: NULL → finance-only). Guard ORDER matches
 * the app: JwtAuthGuard (401) → RolesGuard (403) → EntitlementGuard (402).
 *
 * All roles may READ; owner/accountant may WRITE. Tenant isolation lives in the
 * service (every query filtered by schoolId). ParseUUIDPipe → bad UUID 400.
 */
@Controller('schools/:schoolId/accreditation/standards')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class StandardsController {
  constructor(private readonly accreditation: AccreditationService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.accreditation.listStandards(schoolId)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateStandardDto,
    @CurrentUser() user: User,
  ) {
    return this.accreditation.createStandard(schoolId, dto, user.id)
  }

  @Patch(':standardId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('standardId', ParseUUIDPipe) standardId: string,
    @Body() dto: UpdateStandardDto,
    @CurrentUser() user: User,
  ) {
    return this.accreditation.updateStandard(schoolId, standardId, dto, user.id)
  }

  @Delete(':standardId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('standardId', ParseUUIDPipe) standardId: string,
    @CurrentUser() user: User,
  ) {
    return this.accreditation.removeStandard(schoolId, standardId, user.id)
  }
}
