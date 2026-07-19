import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { PrismaModule } from '../prisma/prisma.module.js'
import { RetentionService } from './retention.service.js'

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  providers: [RetentionService],
})
export class RetentionModule {}
