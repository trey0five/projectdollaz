import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import type { ReportBundle } from '@finrep/engine'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { GenerateReportsDto } from './dto/generate-reports.dto.js'
import { ReportsService } from './reports.service.js'

@Controller('reports')
// Phase 1B: the no-op StubAuthGuard is replaced by the real JwtAuthGuard. The
// engine wrapper is server-side compute and now requires a valid access token,
// even though the web app's live preview computes reports purely client-side.
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // POST /reports/generate — stateless engine wrapper (authenticated).
  @Post('generate')
  generate(@Body() dto: GenerateReportsDto): ReportBundle {
    return this.reports.generate(dto)
  }
}
