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
import { AssessmentsService } from './assessments.service.js'
import { GradebookService } from './gradebook.service.js'
import { LessonPlansService } from './lesson-plans.service.js'
import {
  AssessmentQueryDto,
  AssessmentUploadDto,
  AttachResultDto,
  CreateLessonPlanDto,
  GradebookQueryDto,
  LessonPlanQueryDto,
  ResultQueryDto,
  UpdateLessonPlanDto,
} from './dto/academics.dto.js'

/** 25 MB — the roster upload's precedent; a diocesan score file is far smaller. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

interface UploadedAssessmentFile {
  buffer: Buffer
  originalname?: string
}

/**
 * Academics — the 9th domain and 8th sellable module: assessments, gradebook and
 * lesson plans. Class-level @RequiresModule('academics') makes the shared
 * EntitlementGuard answer 402 { code:'MODULE_NOT_LICENSED', module:'academics' }
 * for an entitled-but-unlicensed school, on EVERY route including the reads.
 * Guard order matches the app: JwtAuthGuard (401) → RolesGuard (403) →
 * EntitlementGuard (402).
 *
 * ROLE SPLIT IS A PRIVACY BOUNDARY HERE, not just an edit permission. Summary
 * and dashboard reads are open to every role because they are aggregates with no
 * identity in them. The REGISTERS (`/assessments/results`, `/gradebook/records`)
 * are the only routes that return a student's name beside a score, so they are
 * owner/accountant only.
 */
@Controller('schools/:schoolId/academics')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('academics')
export class AcademicsController {
  constructor(
    private readonly assessments: AssessmentsService,
    private readonly gradebook: GradebookService,
    private readonly lessonPlans: LessonPlansService,
  ) {}

  // ── status ────────────────────────────────────────────────────────────────

  @Get('status')
  @Roles('owner', 'accountant', 'viewer')
  async status(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    const [assessments, lessons, grades] = await Promise.all([
      this.assessments.summary(schoolId),
      this.lessonPlans.summary(schoolId),
      this.gradebook.summary(schoolId),
    ])
    return { assessments, lessonPlans: lessons, gradebook: grades }
  }

  // ── assessments ───────────────────────────────────────────────────────────

  @Post('assessments/upload')
  @Roles('owner', 'accountant')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }))
  preview(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @UploadedFile() file: UploadedAssessmentFile | undefined,
    @Body() dto: AssessmentUploadDto,
  ) {
    return this.assessments.preview(schoolId, file as UploadedAssessmentFile, dto)
  }

  @Post('assessments/commit')
  @Roles('owner', 'accountant')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }))
  commit(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @UploadedFile() file: UploadedAssessmentFile | undefined,
    @Body() dto: AssessmentUploadDto,
    @CurrentUser() user: User,
  ) {
    return this.assessments.commit(schoolId, file as UploadedAssessmentFile, { ...dto, userId: user?.id })
  }

  @Get('assessments/summary')
  @Roles('owner', 'accountant', 'viewer')
  summary(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() q: AssessmentQueryDto) {
    return this.assessments.summary(schoolId, q)
  }

  @Get('assessments/dashboard')
  @Roles('owner', 'accountant', 'viewer')
  dashboard(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() q: AssessmentQueryDto) {
    return this.assessments.dashboard(schoolId, q)
  }

  /** REGISTER — the only assessment route that returns a student's name. */
  @Get('assessments/results')
  @Roles('owner', 'accountant')
  results(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() q: ResultQueryDto) {
    return this.assessments.listResults(schoolId, q)
  }

  @Patch('assessments/results/:id/attach')
  @Roles('owner', 'accountant')
  attach(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachResultDto,
  ) {
    return this.assessments.attachResult(schoolId, id, dto.studentId)
  }

  @Get('assessments/imports')
  @Roles('owner', 'accountant', 'viewer')
  imports(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.assessments.listImports(schoolId)
  }

  @Delete('assessments/imports/:id')
  @Roles('owner', 'accountant')
  revert(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.revert(schoolId, id)
  }

  // ── gradebook ─────────────────────────────────────────────────────────────

  @Get('gradebook/summary')
  @Roles('owner', 'accountant', 'viewer')
  gradeSummary(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() q: GradebookQueryDto) {
    return this.gradebook.summary(schoolId, q.schoolYear)
  }

  @Get('gradebook/courses')
  @Roles('owner', 'accountant', 'viewer')
  courses(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() q: GradebookQueryDto) {
    return this.gradebook.listCourses(schoolId, q.schoolYear)
  }

  /** REGISTER — marks beside student names. */
  @Get('gradebook/records')
  @Roles('owner', 'accountant')
  records(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() q: GradebookQueryDto) {
    return this.gradebook.listRecords(schoolId, q)
  }

  // ── lesson plans ──────────────────────────────────────────────────────────

  @Get('lesson-plans')
  @Roles('owner', 'accountant', 'viewer')
  listPlans(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Query() q: LessonPlanQueryDto) {
    return this.lessonPlans.list(schoolId, q)
  }

  @Get('lesson-plans/summary')
  @Roles('owner', 'accountant', 'viewer')
  planSummary(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.lessonPlans.summary(schoolId)
  }

  @Post('lesson-plans')
  @Roles('owner', 'accountant')
  createPlan(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateLessonPlanDto,
    @CurrentUser() user: User,
  ) {
    return this.lessonPlans.create(schoolId, dto as unknown as Record<string, unknown>, user?.id)
  }

  @Patch('lesson-plans/:id')
  @Roles('owner', 'accountant')
  updatePlan(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLessonPlanDto,
  ) {
    return this.lessonPlans.update(schoolId, id, dto as unknown as Record<string, unknown>)
  }

  @Delete('lesson-plans/:id')
  @Roles('owner', 'accountant')
  removePlan(@Param('schoolId', ParseUUIDPipe) schoolId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessonPlans.remove(schoolId, id)
  }
}
