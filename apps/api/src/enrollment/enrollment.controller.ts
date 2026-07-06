import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { EnrollmentService, type UploadedRosterFile } from './enrollment.service.js'
import {
  EnrollmentCallbackDto,
  EnrollmentConnectKeyDto,
  EnrollmentManualDto,
  EnrollmentSyncDto,
  EnrollmentUploadDto,
} from './dto/enrollment.dto.js'

// A OneRoster export can be large-ish (thousands of students) — 25MB matches Knowledge.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/**
 * Phase 2 — Enrollment Intelligence connector. Membership-checked by RolesGuard on
 * :schoolId; entitlement-gated to the `enrollment` module. Reads open to all roles;
 * connect/sync/upload/manual/disconnect are owner/accountant. Mirrors the QBO
 * controller's guard chain + role split exactly.
 */
@Controller('schools/:schoolId/enrollment')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('enrollment')
export class EnrollmentController {
  constructor(private readonly enrollment: EnrollmentService) {}

  @Get('status')
  @Roles('owner', 'accountant', 'viewer')
  status(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.enrollment.status(schoolId)
  }

  /** Returns the Blackbaud consent URL for the frontend to redirect to (state=schoolId). */
  @Get('connect')
  @Roles('owner', 'accountant')
  connect(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return { url: this.enrollment.authorizeUrl(schoolId) }
  }

  /** OAuth callback: the frontend posts the code it received from Blackbaud. */
  @Post('callback')
  @Roles('owner', 'accountant')
  callback(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: EnrollmentCallbackDto,
    @CurrentUser() user: User,
  ) {
    return this.enrollment.connect(schoolId, dto.code, user.id)
  }

  /** Connect a key/basic provider (FACTS, Veracross, OneRoster REST, Blackbaud sub-key). */
  @Post('connect-key')
  @Roles('owner', 'accountant')
  connectKey(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: EnrollmentConnectKeyDto,
    @CurrentUser() user: User,
  ) {
    return this.enrollment.connectKey(schoolId, dto, user.id)
  }

  /** Upload a OneRoster export (ZIP or bare users.csv) → parse → intake → promote. */
  @Post('upload')
  @Roles('owner', 'accountant')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  upload(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @UploadedFile() file: UploadedRosterFile | undefined,
    @Body() dto: EnrollmentUploadDto,
    @CurrentUser() user: User,
  ) {
    return this.enrollment.upload(user, schoolId, file, dto.observedOn)
  }

  /** Live-sync the connected provider as of an optional date. */
  @Post('sync')
  @Roles('owner', 'accountant')
  sync(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: EnrollmentSyncDto,
    @CurrentUser() user: User,
  ) {
    return this.enrollment.sync(user, schoolId, dto.asOf)
  }

  /** Save a hand-entered roster snapshot (byGrade). */
  @Post('manual')
  @Roles('owner', 'accountant')
  manual(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: EnrollmentManualDto,
    @CurrentUser() user: User,
  ) {
    return this.enrollment.manual(user, schoolId, dto.observedOn, dto.byGrade)
  }

  /** Snapshot time-series, optionally scoped to a period. Read-open. */
  @Get('snapshots')
  @Roles('owner', 'accountant', 'viewer')
  snapshots(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('periodId') periodId?: string,
  ) {
    return this.enrollment.snapshots(schoolId, periodId)
  }

  /** Latest headcount + vs-plan summary, optionally scoped to a period. Read-open. */
  @Get('summary')
  @Roles('owner', 'accountant', 'viewer')
  summary(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('periodId') periodId?: string,
  ) {
    return this.enrollment.summary(schoolId, periodId)
  }

  /** Disconnect. `?removeData=true` purges snapshots + clears connector-stamped enrollment. */
  @Delete()
  @Roles('owner', 'accountant')
  disconnect(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('removeData') removeData: string,
    @CurrentUser() user: User,
  ) {
    return this.enrollment.disconnect(user, schoolId, removeData === 'true')
  }
}
