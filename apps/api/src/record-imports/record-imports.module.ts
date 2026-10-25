import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { FacilitiesModule } from '../facilities/facilities.module.js'
import { AdvancementModule } from '../advancement/advancement.module.js'
import { AccreditationModule } from '../accreditation/accreditation.module.js'
import { GovernanceModule } from '../governance/governance.module.js'
import { RecordImportsService } from './record-imports.service.js'
import {
  CampaignsImportController,
  GiftsImportController,
  MaintenanceImportController,
  PdfTableController,
  StaffImportController,
  StandardsImportController,
} from './record-imports.controller.js'

/**
 * File imports for the remaining modules (#51). DEP DIRECTION: this module
 * imports the module services it writes through and is imported by nothing,
 * so it can never close a cycle.
 */
@Module({
  imports: [AuthModule, BillingModule, FacilitiesModule, AdvancementModule, AccreditationModule, GovernanceModule],
  controllers: [
    MaintenanceImportController,
    GiftsImportController,
    CampaignsImportController,
    StandardsImportController,
    StaffImportController,
    PdfTableController,
  ],
  providers: [RecordImportsService],
})
export class RecordImportsModule {}
