import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { AuditModule } from '../common/audit/audit.module.js'
import { OrganizationsController } from './organizations.controller.js'
import { OrganizationsService } from './organizations.service.js'
import { DocumentStorageService } from '../knowledge/document-storage.service.js'

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, DocumentStorageService],
})
export class OrganizationsModule {}
