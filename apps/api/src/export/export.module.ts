import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { KnowledgeModule } from '../knowledge/knowledge.module.js'
import { DataExportController } from './export.controller.js'
import { DataExportService } from './export.service.js'

/**
 * Data export. Depends on KnowledgeModule only for DocumentStorageService — the
 * archive lives in the same S3 bucket as the document store, behind the same
 * presigned-URL discipline.
 */
@Module({
  // AuthModule provides TokenService, which JwtAuthGuard needs. The unit tests
  // passed without it and the CONTAINER refused to boot — the module-resolution
  // spec beside this file is what turns that into a test failure instead.
  imports: [AuthModule, PrismaModule, AuditModule, KnowledgeModule],
  controllers: [DataExportController],
  providers: [DataExportService],
  exports: [DataExportService],
})
export class DataExportModule {}
