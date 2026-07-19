import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { SchoolsController } from './schools.controller.js'
import { SchoolsService } from './schools.service.js'
// Stateless S3 helper (only depends on ConfigService) — provided directly so
// delete-school can erase a tenant's documents from S3 (the DB cascade never
// touches the object store).
import { DocumentStorageService } from '../knowledge/document-storage.service.js'

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, BillingModule],
  controllers: [SchoolsController],
  providers: [SchoolsService, DocumentStorageService],
  // Exported so Penny's invite_member confirm-tool (AssistantModule) can reuse the
  // REAL invitation flow (member/dup checks + token + email + revoke). No cycle:
  // SchoolsModule imports nothing assistant-side.
  exports: [SchoolsService],
})
export class SchoolsModule {}
