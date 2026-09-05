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
import { RosterUploadService } from './roster-upload.service.js'
import { EnrollmentAnalyticsService } from './analytics/enrollment-analytics.service.js'
import { EnrollmentAnalyticsQueryDto } from './analytics/dto/enrollment-analytics.dto.js'
import {
  EnrollmentCallbackDto,
  EnrollmentConnectKeyDto,
  EnrollmentManualDto,
  EnrollmentRevertManualDto,
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
  constructor(
    private readonly enrollment: EnrollmentService,
    private readonly rosterUpload: RosterUploadService,
    private readonly enrollmentAnalytics: EnrollmentAnalyticsService,
  ) {}

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

  /**
   * Upload a OneRoster export (ZIP or bare users.csv) → parse → student records
   * (when the file carries per-student detail) → snapshot → promote, in ONE call.
   * The decorator stack is deliberately unchanged: a viewer cannot reach this
   * route, and that is what keeps student creation off the viewer role.
   */
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
    return this.rosterUpload.upload(user, schoolId, file, {
      observedOn: dto.observedOn,
      mode: dto.mode,
      fiscalPeriodId: dto.fiscalPeriodId,
    })
  }

  /**
   * Live-sync the connected provider as of an optional date → student records
   * (when the provider carries per-student detail) → snapshot → promote.
   *
   * Routed through RosterUploadService for the same reason `upload` is: it is the
   * one service that may touch BOTH the snapshot and the register (StudentsService
   * imports EnrollmentService, so EnrollmentService can never import it back). The
   * response is counts-only — the provider's rows carry student names and stop at
   * that service.
   */
  @Post('sync')
  @Roles('owner', 'accountant')
  sync(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: EnrollmentSyncDto,
    @CurrentUser() user: User,
  ) {
    return this.rosterUpload.sync(user, schoolId, dto.asOf)
  }

  /**
   * The intake receipts — which file (or sync) produced the numbers on screen and
   * what each one wrote. Readable by any member: it is counts and a filename, the
   * same things the Enrollment page already shows.
   */
  @Get('imports')
  @Roles('owner', 'accountant', 'viewer')
  listImports(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.rosterUpload.listImports(schoolId)
  }

  /**
   * Presigned URL for the RETAINED ORIGINAL roster file of one receipt — the ONE
   * download door for roster bytes. Owner/accountant ONLY, deliberately narrower
   * than the viewer-open receipts list above: the receipt is a filename and
   * counts, but the FILE carries student names, so its download is gated to the
   * same roles that could have run the import. The knowledge store's generic
   * (viewer-open) routes refuse these docs; 404 when no file was retained (every
   * pre-retention receipt).
   */
  @Get('imports/:importId/original-url')
  @Roles('owner', 'accountant')
  importOriginalUrl(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('importId', ParseUUIDPipe) importId: string,
    @CurrentUser() user: User,
  ) {
    return this.rosterUpload.originalDownloadUrl(schoolId, importId, user.id)
  }

  /**
   * Delete ONE receipt. Removes the RECORD OF an import, never the students it
   * created — those are removed in the register. The UI says so out loud, because
   * "delete import" read as "delete the students" is how a school loses a roster.
   */
  @Delete('imports/:importId')
  @Roles('owner', 'accountant')
  removeImport(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('importId', ParseUUIDPipe) importId: string,
    @CurrentUser() user: User,
  ) {
    return this.rosterUpload.removeImport(schoolId, importId, user.id)
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

  /**
   * Everything the Enrollment ANALYTICS tab draws, in one server-computed read:
   * registry tiles, the dated headcount trend, the grade × year grid, cohort size
   * progression, actual-vs-plan by grade, demographics and the register mix —
   * plus the honesty lines and the named list of what we will not fake.
   *
   * A SUB-ROUTE, not an extension of /summary: EnrollmentSummary has four in-tree
   * consumers and a frozen shape. It inherits the class-level guard chain
   * (Jwt + Roles + Entitlement @RequiresModule('enrollment')) exactly as it
   * stands, so there is no new guard surface to get wrong — only the role split.
   */
  @Get('analytics')
  @Roles('owner', 'accountant', 'viewer')
  analytics(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query() query: EnrollmentAnalyticsQueryDto,
  ) {
    return this.enrollmentAnalytics.analytics(schoolId, query)
  }

  /** Latest-snapshot demographic + grade mix (shares + diversity). Read-open. */
  @Get('demographics')
  @Roles('owner', 'accountant', 'viewer')
  demographics(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('periodId') periodId?: string,
  ) {
    return this.enrollment.demographics(schoolId, periodId)
  }

  /** Revert a manual-supersede: restore the backed-up hand-entered enrollment. */
  @Post('revert-manual')
  @Roles('owner', 'accountant')
  revertManual(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: EnrollmentRevertManualDto,
    @CurrentUser() user: User,
  ) {
    return this.enrollment.revertManual(user, schoolId, dto.periodId)
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
