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
  ClearRosterDto,
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

  /**
   * Commit the previewed/user-edited rows (JSON — the file is never re-sent).
   *
   * DECISION 2, SAME AS THE ONE-STEP UPLOAD. This is the other explicit roster
   * import: an owner/accountant has looked at every row and pressed Import, so it
   * supersedes a hand-entered enrollment for the period — reversibly (revertManual
   * restores it) and out loud (the response carries `promote`, and the panel says
   * which branch happened). Without it the reviewed path landed the records and
   * silently left the finance number stale — the reported bug, on the other card.
   *
   * `supersedeManual` is set HERE, not accepted from the client: it is a property
   * of the route (a reviewed, deliberate import), not a client preference, and the
   * global forbidNonWhitelisted pipe would reject it as a body field anyway.
   *
   * NOT passed: `observedOn`. This path commits rows the user is looking at NOW —
   * there is no file date to honour — so it promotes into today's fiscal period.
   * The one-step upload passes the file's date. The copy on each card says so.
   */
  @Post('import/commit')
  @Roles('owner', 'accountant')
  importCommit(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: ImportCommitDto,
    @CurrentUser() user: User,
  ) {
    // …and only when the committed rows actually enroll somebody. An import of
    // nothing but withdrawn rows recomputes a roster total of 0, and a 0 nobody
    // typed must not replace a hand-entered headcount.
    const enrollsSomebody = dto.rows.some((r) => (r.status ?? 'enrolled') === 'enrolled')
    return this.students.importCommit(user, schoolId, dto.mode, dto.rows, {
      supersedeManual: enrollsSomebody,
    })
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

  /**
   * Clear the WHOLE register. Declared here with the static routes and BEFORE
   * `@Delete(':id')` — Nest matches in declaration order, and `/students` must not
   * be read as an id.
   *
   * A DELETE with a body is unusual, and deliberate: `expectedCount` is the number
   * the confirm dialog showed the user, and the service refuses if the register has
   * changed since. Owner/accountant only, like every other write here.
   */
  @Delete()
  @Roles('owner', 'accountant')
  clear(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: ClearRosterDto,
    @CurrentUser() user: User,
  ) {
    return this.students.clear(user, schoolId, dto.expectedCount)
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
