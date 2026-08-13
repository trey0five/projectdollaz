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
    await this.assertMember(user, orgId)
    const index = await this.nameMatch.buildIndex(orgId)
    return this.assessments.orgPreview(orgId, file as UploadedAssessmentFile, dto, (name) => {
      const m = this.nameMatch.matchOne(name, index)
      return { schoolId: m.decision === 'auto' ? m.matchedSchoolId : null, matchedName: m.matchedName, decision: m.decision }
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
    await this.assertMember(user, orgId)
    const index = await this.nameMatch.buildIndex(orgId)
    return this.assessments.orgCommit(
      orgId,
      file as UploadedAssessmentFile,
      { ...dto, userId: user?.id },
      (name) => {
        const m = this.nameMatch.matchOne(name, index)
        return { schoolId: m.decision === 'auto' ? m.matchedSchoolId : null }
      },
    )
  }

  /** Membership in ANY school of the org — the same rule the other roll-ups use. */
  private async assertMember(user: User, orgId: string): Promise<void> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id, school: { organizationId: orgId } },
      select: { id: true },
    })
    if (!membership) throw new ForbiddenException('Not a member of this organization.')
  }
}
