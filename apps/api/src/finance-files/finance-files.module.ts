import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { PeriodsModule } from '../periods/periods.module.js'
import { StatementsModule } from '../statements/statements.module.js'
import { FinanceFilesController } from './finance-files.controller.js'
import { FinanceInventoryService } from './finance-inventory.service.js'
import { FinanceRemovalsService } from './finance-removals.service.js'

/**
 * Finance files on record: the all-years inventory, restorable removal and
 * restore. FinanceRemovalsService is exported so ImportsService (the legacy
 * trial-balance DELETE + KYRO's undo) and MonthlySnapshotsService (the per-month
 * Delete) route their deletes through the bin.
 *
 * Deliberately imports NEITHER ImportsModule NOR MonthlyModule (both import
 * this one); StatementsModule / PeriodsModule import neither, so no cycle.
 */
@Module({
  imports: [AuthModule, AuditModule, PeriodsModule, StatementsModule],
  controllers: [FinanceFilesController],
  providers: [FinanceInventoryService, FinanceRemovalsService],
  exports: [FinanceRemovalsService],
})
export class FinanceFilesModule {}
