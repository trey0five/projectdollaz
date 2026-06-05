import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common'
import type { Response } from 'express'
import { HealthService } from './health.service.js'

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  // GET /health -> 200 { status:'ok', db:'ok' } | 503 { status:'degraded', db:'down' }
  @Get()
  @HttpCode(HttpStatus.OK)
  async get(@Res({ passthrough: true }) res: Response) {
    const result = await this.health.check()
    res.status(
      result.db === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    )
    return result
  }
}
