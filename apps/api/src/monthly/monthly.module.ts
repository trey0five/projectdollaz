import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { MappingModule } from '../mapping/mapping.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { MonthlyController } from './monthly.controller.js'
import { MonthlySnapshotsService } from './monthly-snapshots.service.js'
import { MonthlyActualsService } from './monthly-actuals.service.js'

/**
 * MONTHLY actuals foundation. Reuses PeriodsService (tenant-checked period),
 * MappingService (active mapping/chart), the pure @finrep/engine + @finrep/
 * analytics, and AuditService. BillingModule supplies the EntitlementGuard on
 * the write endpoints. Purely additive — does not participate in the annual
 * Import/StatementSnapshot flow.
 */
@Module({
  imports: [AuthModule, AuditModule, PeriodsModule, MappingModule, BillingModule],
  controllers: [MonthlyController],
  providers: [MonthlySnapshotsService, MonthlyActualsService],
  exports: [MonthlySnapshotsService, MonthlyActualsService],
})
export class MonthlyModule {}
