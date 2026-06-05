import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

export interface HealthStatus {
  status: 'ok' | 'degraded'
  db: 'ok' | 'down'
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Probes DB connectivity with a trivial round-trip. */
  async check(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { status: 'ok', db: 'ok' }
    } catch {
      return { status: 'degraded', db: 'down' }
    }
  }
}
