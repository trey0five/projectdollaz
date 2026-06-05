import { Injectable } from '@nestjs/common'
import {
  generateReports,
  type NormalizedRow,
  type ReportBundle,
  type SchoolConfig,
} from '@finrep/engine'
import { GenerateReportsDto } from './dto/generate-reports.dto.js'

/**
 * STATELESS wrapper proving the shared @finrep/engine runs server-side.
 * No DB, no persistence — pure input -> output. The api forwards meta
 * (engine/mapping/chart versions) unchanged; it does not compute versions.
 */
@Injectable()
export class ReportsService {
  generate(dto: GenerateReportsDto): ReportBundle {
    const school: SchoolConfig = {
      netAssetsBegin: dto.school.netAssetsBegin,
      pyNetAssetsBegin: dto.school.pyNetAssetsBegin,
      auditNetAssetsBegin: dto.school.auditNetAssetsBegin,
    }

    return generateReports({
      cyData: dto.cyData as NormalizedRow[],
      pyData: dto.pyData as NormalizedRow[],
      auditData: dto.auditData as NormalizedRow[],
      school,
    })
  }
}
