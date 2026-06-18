import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { MappingController } from './mapping.controller.js'
import { MappingService } from './mapping.service.js'

/**
 * Active mapping/chart seed + version surface. MappingService is exported so the
 * Statements module can resolve the active mapping/chart before generating.
 */
@Module({
  imports: [AuthModule],
  controllers: [MappingController],
  providers: [MappingService],
  exports: [MappingService],
})
export class MappingModule {}
