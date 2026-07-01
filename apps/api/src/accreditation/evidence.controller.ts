import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CreateEvidenceDto } from './dto/create-evidence.dto.js'

/**
 * Phase 4 Accreditation v1 — the EVIDENCE routes, NESTED under a standard so the
 * standardId∈school invariant is a first-class URL contract. Same guard chain +
 * @RequiresModule('accreditation') as the standards controller.
 *
 * The service resolves the parent standard (findFirst {id, schoolId}) FIRST on every
 * op, so a foreign/cross-tenant/cross-standard target is a 404 — evidence can never
 * be created under, listed from, or deleted under a standard the path school does
 * not own. v1 is CREATE + LIST + DELETE only (evidence edit deferred).
 */
@Controller('schools/:schoolId/accreditation/standards/:standardId/evidence')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class EvidenceController {
  constructor(private readonly accreditation: AccreditationService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('standardId', ParseUUIDPipe) standardId: string,
  ) {
    return this.accreditation.listEvidence(schoolId, standardId)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('standardId', ParseUUIDPipe) standardId: string,
    @Body() dto: CreateEvidenceDto,
    @CurrentUser() user: User,
  ) {
    return this.accreditation.createEvidence(schoolId, standardId, dto, user.id)
  }

  @Delete(':evidenceId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('standardId', ParseUUIDPipe) standardId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @CurrentUser() user: User,
  ) {
    return this.accreditation.removeEvidence(schoolId, standardId, evidenceId, user.id)
  }
}
