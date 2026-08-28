import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { RequiresModule } from '../billing/requires-module.decorator.js'
import { AccreditationService } from './accreditation.service.js'
import { AccreditationExplainerService } from './accreditation-explainer.service.js'

/**
 * Phase 4 Accreditation — the "attach from operations" DISCOVERY routes. The
 * base path moved up one segment in Phase 3 so this ONE controller can serve
 * both discovery routes (paths are byte-identical to before for
 * evidence-sources):
 *   GET .../accreditation/evidence-sources                      — the school's
 *     linkable operational artifacts (policies + board reports, and the Phase 3
 *     siblings: approved-minutes meetings, strategic plans, knowledge documents,
 *     the virtual governance report).
 *   GET .../accreditation/standards/:standardId/suggestions     — deterministic
 *     tag-matched artifact suggestions for one catalog-linked standard ([] for
 *     hand-made standards).
 *
 * Same guard chain + @RequiresModule('accreditation') as the standards
 * controller; the service scopes every query by the path schoolId (and resolves
 * the standard FIRST for suggestions — a foreign standardId 404s). All roles
 * may READ (read-only discovery).
 */
@Controller('schools/:schoolId/accreditation')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
@RequiresModule('accreditation')
export class EvidenceSourcesController {
  constructor(
    private readonly accreditation: AccreditationService,
    private readonly explainer: AccreditationExplainerService,
  ) {}

  @Get('evidence-sources')
  @Roles('owner', 'accountant', 'viewer')
  list(@Param('schoolId', ParseUUIDPipe) schoolId: string) {
    return this.accreditation.listEvidenceSources(schoolId)
  }

  @Get('standards/:standardId/suggestions')
  @Roles('owner', 'accountant', 'viewer')
  suggestions(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('standardId', ParseUUIDPipe) standardId: string,
  ) {
    return this.accreditation.listSuggestions(schoolId, standardId)
  }

  /**
   * WS3 F3 — one standard's whole story: verbatim statement, authored plain
   * language (null renders nothing), live evidence checklist, rubric position,
   * bound signals, attach suggestions. All roles — committee members are
   * viewers, and this drawer exists for them. Foreign id 404s in the service.
   */
  @Get('standards/:standardId/explainer')
  @Roles('owner', 'accountant', 'viewer')
  explain(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('standardId', ParseUUIDPipe) standardId: string,
  ) {
    return this.explainer.getExplainer(schoolId, standardId)
  }
}
