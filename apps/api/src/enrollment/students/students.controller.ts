// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Student roster controller. Same guard chain + role split as the
// enrollment connector (JwtAuthGuard membership-checks :schoolId; entitlement-
// gated to the `enrollment` module). Reads open to all roles; every write is
// owner/accountant. STATIC routes (aggregate/batch/import/promote-snapshot) are
// declared BEFORE the :id routes — Nest matches in declaration order.
//
// FERPA: the register (GET /, GET /:id, create/patch responses, import preview)
// is the ONLY name-bearing surface, and it lives behind the authed schoolId-
// scoped guard chain. GET /aggregate returns counts only.
// ─────────────────────────────────────────────────────────────────────────────
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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../../common/guards/roles.guard.js'
import { Roles } from '../../common/decorators/roles.decorator.js'
import { CurrentUser } from '../../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../../billing/entitlement.guard.js'
import { RequiresModule } from '../../billing/requires-module.decorator.js'
import { StudentsService } from './students.service.js'
import {
  BatchCreateStudentsDto,
  CreateStudentDto,
  ImportCommitDto,
  ListStudentsQueryDto,
  PromoteSnapshotDto,
  StudentFilterQueryDto,
  UpdateStudentDto,
} from './students.dto.js'

// Same ceiling as the aggregate roster upload (25MB matches Knowledge).
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

interface UploadedCsv {
  buffer: Buffer
  originalname: string
  size: number
}

@Controller('schools/:schoolId/enrollment/students')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('enrollment')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  // ── Static routes FIRST (declaration order beats :id) ────────────────────────

  /** FERPA-safe aggregation — same filter params as the register, counts only. */
  @Get('aggregate')
  @Roles('owner', 'accountant', 'viewer')
  aggregate(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() query: StudentFilterQueryDto) {
    return this.students.aggregate(schoolId, query)
  }

  /** All-or-nothing batch create (the Add-students wizard basket, ≤200). */
  @Post('batch')
  @Roles('owner', 'accountant')
  batch(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: BatchCreateStudentsDto,
    @CurrentUser() user: User,
  ) {
    return this.students.batch(user, schoolId, dto.students)
  }

  /** STATELESS preview: parse + match, zero DB writes. `file` = roster CSV
   *  (OneRoster users.csv or simple flat); `demographics` = optional second CSV. */
  @Post('import/preview')
  @Roles('owner', 'accountant')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'demographics', maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } },
    ),
  )
  importPreview(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @UploadedFiles() files: { file?: UploadedCsv[]; demographics?: UploadedCsv[] } | undefined,
  ) {
    return this.students.importPreview(schoolId, files?.file?.[0], files?.demographics?.[0])
  }

  /** Commit the previewed/user-edited rows (JSON — the file is never re-sent). */
  @Post('import/commit')
  @Roles('owner', 'accountant')
  importCommit(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: ImportCommitDto,
    @CurrentUser() user: User,
  ) {
    return this.students.importCommit(user, schoolId, dto.mode, dto.rows)
  }

  /** Explicit dated roster→snapshot backfill (default today). */
  @Post('promote-snapshot')
  @Roles('owner', 'accountant')
  promoteSnapshot(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: PromoteSnapshotDto,
    @CurrentUser() user: User,
  ) {
    return this.students.promoteSnapshot(user, schoolId, dto.observedOn)
  }

  // ── Register list + CRUD ─────────────────────────────────────────────────────

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() query: ListStudentsQueryDto) {
    return this.students.list(schoolId, query)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateStudentDto,
    @CurrentUser() user: User,
  ) {
    return this.students.create(user, schoolId, dto)
  }

  @Get(':id')
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.get(schoolId, id)
  }

  @Patch(':id')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: User,
  ) {
    return this.students.update(user, schoolId, id, dto)
  }

  /** Hard delete (school data stewardship). */
  @Delete(':id')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.students.remove(user, schoolId, id)
  }
}
