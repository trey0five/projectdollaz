import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
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
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { BillingService } from '../billing/billing.service.js'
import { AssessmentsService } from './assessments.service.js'
import { NameMatchService } from '../enrollment/diocesan/name-match.service.js'
import { AssessmentQueryDto, AssessmentUploadDto } from './dto/academics.dto.js'

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

interface UploadedAssessmentFile {
  buffer: Buffer
  originalname?: string
}

/**
 * The DIOCESAN academic console — every school on one screen, which is the view
 * a superintendent actually opens.
 *
 * Membership-scoped like the other org roll-ups (JwtAuthGuard + an explicit
 * "do you belong to a school in this org" check), and reading ONLY the aggregate
 * table, which carries no student identity. That is why this surface needs no
 * per-school role gate: there is nothing here that could name a child.
 *
 * A further @Controller('organizations/:orgId') class is valid in Nest because
 * the sub-path ('academics') differs from metrics/statements/budget/briefing.
 */
@Controller('organizations/:orgId')
@UseGuards(JwtAuthGuard)
export class AcademicsOrgController {
  constructor(
    private readonly assessments: AssessmentsService,
    private readonly prisma: PrismaService,
    private readonly nameMatch: NameMatchService,
    private readonly billing: BillingService,
  ) {}

  @Get('academics/dashboard')
  async dashboard(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @Query() q: AssessmentQueryDto,
  ) {
    await this.assertMember(user, orgId)
    return this.assessments.orgDashboard(orgId, q)
  }

  /**
   * Preview a DIOCESAN file — one upload covering every school. Each school name
   * in the file is resolved against the org's schools with the same matcher (and
   * the same learned aliases) the enrollment import uses, so a diocese that has
   * already taught the system that "St. Mary's" is "Saint Mary School" does not
   * have to teach it twice.
   */
  @Post('academics/assessments/upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async orgPreview(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @UploadedFile() file: UploadedAssessmentFile | undefined,
    @Body() dto: AssessmentUploadDto,
  ) {
    const allowed = await this.writableSchools(user, orgId)
    const index = await this.nameMatch.buildIndex(orgId)
    return this.assessments.orgPreview(orgId, file as UploadedAssessmentFile, dto, (name) => {
      const m = this.nameMatch.matchOne(name, index)
      const id = m.decision === 'auto' ? m.matchedSchoolId : null
      // A school the caller cannot write is reported as unmatched in the preview,
      // so the review step shows exactly what would be skipped.
      const writable = id !== null && allowed.has(id)
      return {
        schoolId: writable ? id : null,
        matchedName: m.matchedName,
        decision: writable ? m.decision : 'not-permitted',
      }
    })
  }

  @Post('academics/assessments/commit')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async orgCommit(
    @CurrentUser() user: User,
    @Param('orgId') orgId: string,
    @UploadedFile() file: UploadedAssessmentFile | undefined,
    @Body() dto: AssessmentUploadDto,
  ) {
    const allowed = await this.writableSchools(user, orgId)
    const index = await this.nameMatch.buildIndex(orgId)
    return this.assessments.orgCommit(
      orgId,
      file as UploadedAssessmentFile,
      { ...dto, userId: user?.id },
      (name) => {
        const m = this.nameMatch.matchOne(name, index)
        const id = m.decision === 'auto' ? m.matchedSchoolId : null
        return { schoolId: id !== null && allowed.has(id) ? id : null }
      },
    )
  }

  /**
   * Membership in ANY school of the org — the READ floor, matching the other
   * roll-ups. Reads are aggregate-only, so membership is the right bar.
   */
  private async assertMember(user: User, orgId: string): Promise<void> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id, school: { organizationId: orgId } },
      select: { id: true },
    })
    if (!membership) throw new ForbiddenException('Not a member of this organization.')
  }

  /**
   * The WRITE floor. A diocesan commit rewrites assessment aggregates and the
   * promoted operational figures for EVERY school in the org — the rows the
   * scorecard, the briefing and the board report read. Membership alone is not
   * enough for that: the equivalent per-school route demands owner/accountant,
   * and an org route that asks for less is a hole around it.
   *
   * EntitlementGuard resolves a schoolId from the request and so cannot fire on
   * an orgId route; the licence check therefore lives here, per school, and is
   * FAIL-CLOSED like every other module gate.
   *
   * Returns the schools this user may actually write, so the service can skip
   * the rest and REPORT the skips rather than silently dropping rows.
   */
  private async writableSchools(user: User, orgId: string): Promise<Set<string>> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        userId: user.id,
        role: { in: ['owner', 'accountant'] },
        school: { organizationId: orgId },
      },
      select: { schoolId: true },
    })
    if (memberships.length === 0) {
      throw new ForbiddenException('Diocesan uploads require an owner or business-manager role.')
    }
    const licensed = await Promise.all(
      memberships.map((m) =>
        this.billing
          .isEntitledForModule(m.schoolId, 'academics')
          .catch(() => false)
          .then((ok) => [m.schoolId, ok] as const),
      ),
    )
    const allowed = new Set(licensed.filter(([, ok]) => ok).map(([id]) => id))
    if (allowed.size === 0) {
      throw new ForbiddenException('No school in this organization has the Academics module.')
    }
    return allowed
  }
}
