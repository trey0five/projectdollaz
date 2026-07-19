import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../../common/decorators/current-user.decorator.js'
import { DiocesanEnrollmentService } from './diocesan-enrollment.service.js'
import { type UploadedRosterFile } from '../enrollment.service.js'
import { DiocesanApplyDto, DiocesanSyncDto, DiocesanUploadDto, RowDecisionDto } from '../dto/diocesan.dto.js'

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/**
 * Granular diocesan enrollment — the two-step ORG import. JwtAuthGuard ONLY:
 * RolesGuard/EntitlementGuard can't resolve a schoolId on an org route (the QBO-org
 * precedent), so org isolation + per-school role/entitlement are enforced inside the
 * service. All DTO fields decorated (global forbidNonWhitelisted).
 */
@Controller('organizations/:orgId/enrollment')
@UseGuards(JwtAuthGuard)
export class DiocesanEnrollmentController {
  constructor(private readonly diocesan: DiocesanEnrollmentService) {}

  /** Step 1 — upload + parse + name-match (NO promote) → review payload. */
  @Post('imports')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @UploadedFile() file: UploadedRosterFile | undefined,
    @Body() dto: DiocesanUploadDto,
    @CurrentUser() user: User,
  ) {
    return this.diocesan.preview(user, orgId, file, dto.observedOn)
  }

  /** Step 1 — API-connect variant (dark / config-gated). */
  @Post('imports/sync')
  sync(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() _dto: DiocesanSyncDto,
    @CurrentUser() user: User,
  ) {
    // The live diocesan API connector is dark; the upload path is the shipped one.
    void user
    void orgId
    return { configured: false, message: 'The diocesan enrollment API connector is not configured on this server.' }
  }

  /** Re-fetch the review payload (resume after reload). */
  @Get('imports/:importId')
  getImport(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('importId', ParseUUIDPipe) importId: string,
    @CurrentUser() user: User,
  ) {
    return this.diocesan.getImport(user, orgId, importId)
  }

  /** Step 2 — reviewer override for one row (persisted). */
  @Patch('imports/:importId/rows/:rowId')
  patchRow(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('importId', ParseUUIDPipe) importId: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body() dto: RowDecisionDto,
    @CurrentUser() user: User,
  ) {
    return this.diocesan.patchRow(user, orgId, importId, rowId, dto)
  }

  /** Step 2 — apply the batch (fan out into the per-school snapshot+promote). */
  @Post('imports/:importId/apply')
  apply(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('importId', ParseUUIDPipe) importId: string,
    @Body() dto: DiocesanApplyDto,
    @CurrentUser() user: User,
  ) {
    return this.diocesan.apply(user, orgId, importId, dto)
  }

  /** Discard a staging batch. */
  @Delete('imports/:importId')
  discard(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('importId', ParseUUIDPipe) importId: string,
    @CurrentUser() user: User,
  ) {
    return this.diocesan.discard(user, orgId, importId)
  }

  /** Learned name aliases for the org (the picker's memory). */
  @Get('aliases')
  listAliases(@Param('orgId', ParseUUIDPipe) orgId: string, @CurrentUser() user: User) {
    return this.diocesan.listAliases(user, orgId)
  }

  /** Unlearn an alias. */
  @Delete('aliases/:id')
  deleteAlias(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.diocesan.deleteAlias(user, orgId, id)
  }
}
