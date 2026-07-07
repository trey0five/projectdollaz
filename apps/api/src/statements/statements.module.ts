import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { MappingModule } from '../mapping/mapping.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { ComplianceModule } from '../compliance/compliance.module.js'
import { StatementsController } from './statements.controller.js'
import { StatementsService } from './statements.service.js'
import { SnapshotHistoryService } from './snapshot-history.service.js'

/**
 * Server-side canonical generate + persist. Reuses PeriodsService (tenant-checked
 * period lookup), MappingService (active mapping/chart resolution), the pure
 * @finrep/engine, and AuditService.
 */
@Module({
  imports: [AuthModule, AuditModule, PeriodsModule, MappingModule, BillingModule, ComplianceModule],
  controllers: [StatementsController],
  providers: [StatementsService, SnapshotHistoryService],
  exports: [StatementsService, SnapshotHistoryService],
})
export class StatementsModule {}
