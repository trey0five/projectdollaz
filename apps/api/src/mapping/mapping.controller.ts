import { Body, Controller, Get, Inject, Param, Patch, UseGuards, forwardRef } from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { StatementsService } from '../statements/statements.service.js'
import { MappingService } from './mapping.service.js'
import { MergeMappingDto } from './dto/merge-mapping.dto.js'

@Controller('schools/:schoolId/mapping')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MappingController {
  constructor(
    private readonly mapping: MappingService,
    private readonly prisma: PrismaService,
    // forwardRef: StatementsModule imports MappingModule to resolve the active
    // chart before generating, so the edge has to go both ways.
    @Inject(forwardRef(() => StatementsService))
    private readonly statements: StatementsService,
  ) {}

  // Seed-on-read: returns (and ensures) the school's active mapping/chart versions.
  @Get()
  @Roles('owner', 'accountant', 'viewer')
  get(@Param('schoolId') schoolId: string) {
    return this.mapping.getActive(schoolId)
  }

  /**
   * Merge account→category picks into the active mapping, THEN rebuild the
   * statements that were computed under the old one.
   *
   * The rebuild is the point. Statements are snapshots taken at save time, so
   * without it a school could categorise every account it was asked to review
   * and watch nothing change — the numbers on screen were still the ones
   * computed before it knew what those accounts meant. QuickBooks schools have
   * had this since their own review flow shipped (qbo.service applyReview);
   * a school that uploaded a file had no equivalent, which is most of them.
   */
  @Patch()
  @Roles('owner', 'accountant')
  async merge(
    @CurrentUser() user: User,
    @Param('schoolId') schoolId: string,
    @Body() dto: MergeMappingDto,
  ) {
    const merged = await this.mapping.mergeEntries(schoolId, dto.entries)

    // Every period that actually holds a current-year import. A period with only
    // a prior-year comparative cannot generate, and failing the whole remap on
    // it would make the review flow unusable for that school forever.
    const rebuilt: string[] = []
    const failed: string[] = []
    const imports = await this.prisma.import.findMany({
      where: { schoolId },
      select: { fiscalPeriodId: true },
      distinct: ['fiscalPeriodId'],
    })
    for (const { fiscalPeriodId } of imports) {
      const cyCount = await this.prisma.import.count({
        where: { schoolId, fiscalPeriodId, role: 'cy' },
      })
      if (cyCount === 0) continue
      try {
        // Regenerated from the SAME imports — no new Import row — so the snapshot
        // is stamped as the reclassification it is, not as an upload.
        await this.statements.generate(user, schoolId, fiscalPeriodId, {}, { trigger: 'remap' })
        rebuilt.push(fiscalPeriodId)
      } catch {
        // One unrenderable period must not lose the user their categorisation.
        failed.push(fiscalPeriodId)
      }
    }
    return { ...merged, statements: { rebuilt: rebuilt.length, failed } }
  }
}
