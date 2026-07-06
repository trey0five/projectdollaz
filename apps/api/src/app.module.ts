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
import { AssistantModule } from './assistant/assistant.module.js'
import { DataHubModule } from './data-hub/data-hub.module.js'
import { GovernanceModule } from './governance/governance.module.js'
import { WorkflowModule } from './workflow/workflow.module.js'
import { AccreditationModule } from './accreditation/accreditation.module.js'
import { FacilitiesModule } from './facilities/facilities.module.js'
import { AdvancementModule } from './advancement/advancement.module.js'
import { KnowledgeModule } from './knowledge/knowledge.module.js'
import { EnrollmentModule } from './enrollment/enrollment.module.js'

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
    AssistantModule,
    DataHubModule,
    GovernanceModule,
    WorkflowModule,
    AccreditationModule,
    FacilitiesModule,
    AdvancementModule,
    KnowledgeModule,
    EnrollmentModule,
  ],
})
export class AppModule {}
