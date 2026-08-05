import { Module, forwardRef } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { StatementsModule } from '../statements/statements.module.js'
import { MappingController } from './mapping.controller.js'
import { MappingService } from './mapping.service.js'

/**
 * Active mapping/chart seed + version surface. MappingService is exported so the
 * Statements module can resolve the active mapping/chart before generating.
 */
@Module({
  // forwardRef both ways: Statements needs the active chart, and a remap needs
  // to rebuild the statements computed under the old one.
  imports: [AuthModule, forwardRef(() => StatementsModule)],
  controllers: [MappingController],
  providers: [MappingService],
  exports: [MappingService],
})
export class MappingModule {}
