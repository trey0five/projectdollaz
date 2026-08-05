import { Module, forwardRef } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module.js'
import { AuthModule } from '../../auth/auth.module.js'
import { NotificationsService } from './notifications.service.js'

/**
 * Shaped like AuditModule: one small always-available writer that feature
 * modules import. AuthModule is where the branded MailerService lives; the
 * forwardRef keeps this importable from modules Auth itself may reach.
 */
@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
