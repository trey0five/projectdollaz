import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { ImprovementModule } from '../improvement/improvement.module.js'
import { PortfolioController } from './portfolio.controller.js'
import { PortfolioService } from './portfolio.service.js'
import { PortfolioBulkAdoptService } from './bulk-adopt.service.js'

/**
 * AIC Phase I — the SUPERINTENDENT PORTFOLIO.
 *
 * ── BOOT SAFETY, WHICH ON THIS CODEBASE IS NOT THEORETICAL ───────────────────
 * This module does NOT import AnalyticsModule, TwinModule, AccreditationModule,
 * VisitModule or StrategyModule. AnalyticsModule is the heaviest module in the
 * graph and the mutual-service dependency class ("Cannot access 'X' before
 * initialization") has crash-looped this container twice. `ImprovementModule`
 * already exports `ImprovementService` and transitively pulls Accreditation and
 * Strategy for its own reasons; we depend on the EXPORTED SERVICE, not on their
 * modules, and add no new edge to either.
 *
 * The two non-module imports worth naming, because they look like module edges and
 * are not: `strategy.constants.ts` (STALE_INITIATIVE_DAYS) and
 * `improvement-progress.ts` (MIN_PROJECTION_SPAN_DAYS) are plain constant/pure
 * modules with no Nest decorators. Importing a number from them is not a DI edge.
 * Re-typing those numbers here would be — a duplicated `14` is how "stale" comes
 * to mean two different things in one product.
 *
 * ── THE `exports` ARRAY IS PRESENT AND NON-EMPTY, ON PURPOSE ─────────────────
 * A provider injected but not exported killed the API on BOOT in Phase E while
 * every unit test passed and the nest build was clean; Phase H then found a second
 * module (AccreditationSignalsModule) with no `exports` array at all. Phase J's
 * Penny tool `get_org_readiness_portfolio` will inject `PortfolioService` from
 * AssistantModule, and the export is what makes that resolvable. Spec API-1 is the
 * SOURCE-READING resolver check — not a `design:paramtypes` reflection, which is
 * vacuous under vitest/esbuild and was proved so by deleting an export and
 * watching the reflective version stay green.
 */
@Module({
  imports: [AuthModule, BillingModule, AuditModule, ImprovementModule],
  controllers: [PortfolioController],
  providers: [PortfolioService, PortfolioBulkAdoptService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
