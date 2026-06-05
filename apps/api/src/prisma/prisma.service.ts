import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@finrep/db'

/**
 * Thin wrapper over the generated Prisma client (@finrep/db). Connects on module
 * init and disconnects on shutdown so DB sessions are tied to the Nest lifecycle.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
