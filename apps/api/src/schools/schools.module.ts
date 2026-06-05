import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { SchoolsController } from './schools.controller.js'
import { SchoolsService } from './schools.service.js'

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SchoolsController],
  providers: [SchoolsService],
})
export class SchoolsModule {}
