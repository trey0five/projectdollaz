import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { SearchController } from './search.controller.js'
import { SearchService } from './search.service.js'
import { DocumentsController } from './documents.controller.js'
import { DocumentsService } from './documents.service.js'
import { DocumentStorageService } from './document-storage.service.js'

/**
 * Phase 4 Knowledge — platform-wide search + the document store (both CORE, NOT a
 * licensed module).
 *
 * DEP DIRECTION (critical — no circular dep): imports AuthModule (the guards),
 * BillingModule (the reused EntitlementGuard + BillingService for search's per-domain
 * gate) and AuditModule (the shared AuditService for document mutations — same as
 * AccreditationModule). PrismaService + ConfigService are global. It does NOT import
 * the domain modules — both services read PRISMA-DIRECT, so there is no cycle.
 * DocumentStorageService wraps S3 (config-driven, lazy client, no boot dependency).
 */
@Module({
  imports: [AuthModule, BillingModule, AuditModule],
  controllers: [SearchController, DocumentsController],
  providers: [SearchService, DocumentsService, DocumentStorageService],
  // Exported so AssistantService (Penny file_document) can inject them cross-module.
  exports: [DocumentsService, DocumentStorageService],
})
export class KnowledgeModule {}
