import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { configuration } from './config/configuration.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { HealthModule } from './health/health.module.js'
import { ReportsModule } from './reports/reports.module.js'
import { AuthModule } from './auth/auth.module.js'
import { SchoolsModule } from './schools/schools.module.js'
import { OrganizationsModule } from './organizations/organizations.module.js'
import { PeriodsModule } from './periods/periods.module.js'
import { ImportsModule } from './imports/imports.module.js'
import { MappingModule } from './mapping/mapping.module.js'
import { StatementsModule } from './statements/statements.module.js'
import { MonthlyModule } from './monthly/monthly.module.js'
import { BillingModule } from './billing/billing.module.js'
import { AnalyticsModule } from './analytics/analytics.module.js'
import { ComplianceModule } from './compliance/compliance.module.js'
import { ReportScheduleModule } from './report-schedule/report-schedule.module.js'
import { AlertModule } from './alerts/alert.module.js'
import { IntegrationsModule } from './integrations/integrations.module.js'
import { BoardReportModule } from './board-report/board-report.module.js'
import { SchedulesModule } from './schedules/schedules.module.js'
import { CashFlowModule } from './cashflow/cashflow.module.js'
import { AssistantModule } from './assistant/assistant.module.js'
import { DataHubModule } from './data-hub/data-hub.module.js'
import { GovernanceModule } from './governance/governance.module.js'
import { WorkflowModule } from './workflow/workflow.module.js'
import { AccreditationModule } from './accreditation/accreditation.module.js'
import { AccreditationSignalsModule } from './accreditation-signals/accreditation-signals.module.js'
import { TwinModule } from './twin/twin.module.js'
import { FacilitiesModule } from './facilities/facilities.module.js'
import { HrModule } from './hr/hr.module.js'
import { AdvancementModule } from './advancement/advancement.module.js'
import { KnowledgeModule } from './knowledge/knowledge.module.js'
import { EnrollmentModule } from './enrollment/enrollment.module.js'
import { StrategyModule } from './strategy/strategy.module.js'
import { ImprovementModule } from './improvement/improvement.module.js'
import { VisitModule } from './visit/visit.module.js'
import { PortfolioModule } from './portfolio/portfolio.module.js'
import { RetentionModule } from './retention/retention.module.js'
import { AdminModule } from './admin/admin.module.js'
import { SupportModule } from './support/support.module.js'
import { InboxModule } from './inbox/inbox.module.js'

@Module({
  imports: [
    // envFilePath lets native `nest start` (cwd = apps/api) load the monorepo
    // root .env. In Docker the vars arrive via compose env_file, so the file
    // need not exist there. Vars already in process.env take precedence (so an
    // exported DATABASE_URL override wins over the file's compose-internal one).
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    HealthModule,
    ReportsModule,
    AuthModule,
    SchoolsModule,
    OrganizationsModule,
    PeriodsModule,
    ImportsModule,
    MappingModule,
    StatementsModule,
    MonthlyModule,
    BillingModule,
    AnalyticsModule,
    ComplianceModule,
    ReportScheduleModule,
    AlertModule,
    IntegrationsModule,
    BoardReportModule,
    SchedulesModule,
    CashFlowModule,
    AssistantModule,
    DataHubModule,
    GovernanceModule,
    WorkflowModule,
    AccreditationModule,
    // AIC Phase B — the accreditation signal panel. A SEPARATE module on purpose:
    // it needs AnalyticsService, and AnalyticsModule already imports
    // AccreditationModule, so hosting it there would be a real DI cycle.
    AccreditationSignalsModule,
    // AIC Phase D — the accreditation twin: the signal catalog, the findings
    // ledger and the 4AM reconciliation. NO CONTROLLER (nothing is user-visible
    // in this phase). Registered AFTER AccreditationSignalsModule so the module
    // graph reads in dependency order: twin -> analytics -> accreditation.
    TwinModule,
    FacilitiesModule,
    // AIC Phase F — the staff-evaluation register, gated on the 'hr' module. The
    // first surface under src/hr/; nothing else in the app imports it.
    HrModule,
    AdvancementModule,
    KnowledgeModule,
    EnrollmentModule,
    StrategyModule,
    // AIC Phase G — the Continuous Improvement Manager. Registered AFTER
    // StrategyModule and AccreditationModule because it imports both (for the
    // shared metric resolver and the readiness gaps), and it imports
    // AnalyticsModule neither directly nor transitively — the boot-safety rule
    // that has crash-looped this container twice. There is deliberately no
    // `improvement` module key: /improvement rides on accreditation OR strategy.
    ImprovementModule,
    // AIC Phase H — the MOCK VISIT. Registered AFTER TwinModule,
    // AccreditationSignalsModule and ImprovementModule because it imports all
    // three (plus AccreditationModule). It owns exactly one GET route and no
    // write route; adoption rides on Phase G's existing idempotent adopt path.
    VisitModule,
    // AIC Phase I — the SUPERINTENDENT PORTFOLIO. Registered AFTER ImprovementModule
    // because it imports it (bulk-adopt rides Phase G's already-idempotent adopt,
    // and Nest resolves an imported module's providers before this one's). It
    // deliberately imports NEITHER AnalyticsModule nor TwinModule/AccreditationModule
    // /VisitModule: the whole phase is "read persisted snapshots, never compute a
    // live twin per school", and a module edge to any of those is the first step
    // back toward the fan-out this phase exists to remove.
    PortfolioModule,
    RetentionModule,
    AdminModule,
    SupportModule,
    InboxModule,
  ],
})
export class AppModule {}
