import { Injectable } from '@nestjs/common'
import type { Mapping, Prisma, StandardChartVersion } from '@finrep/db'
import {
  DEFAULT_CHART,
  DEFAULT_MAPPING,
  MAPPING_VERSION,
  STANDARD_CHART_VERSION,
  type StandardChart,
} from '@finrep/engine'
import { PrismaService } from '../prisma/prisma.service.js'

export interface ActiveMappingChart {
  mapping: Mapping
  chartVersion: StandardChartVersion
  /** A StandardChart rebuilt from the ACTIVE rows — fed to the engine. */
  chart: StandardChart
}

/**
 * Persists + versions the per-school SCoA mapping and the global chart version so
 * statement snapshots are reproducible. No mapping-editor in 1C — on first use we
 * SEED both from the engine defaults so the stored version stamps equal the engine
 * constants (MAPPING_VERSION / STANDARD_CHART_VERSION).
 */
@Injectable()
export class MappingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ensure the global chart version row exists (idempotent on @unique version). */
  private async ensureChartVersion(): Promise<StandardChartVersion> {
    const existing = await this.prisma.standardChartVersion.findUnique({
      where: { version: STANDARD_CHART_VERSION },
    })
    if (existing) return existing
    return this.prisma.standardChartVersion.upsert({
      where: { version: STANDARD_CHART_VERSION },
      update: {},
      create: {
        version: STANDARD_CHART_VERSION,
        effectiveDate: new Date(),
        chart: DEFAULT_CHART as unknown as Prisma.InputJsonValue,
      },
    })
  }

  /** Ensure the school has an ACTIVE mapping; seed from DEFAULT_MAPPING on first use. */
  private async ensureMapping(schoolId: string): Promise<Mapping> {
    const existing = await this.prisma.mapping.findFirst({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) return existing
    return this.prisma.mapping.upsert({
      where: { schoolId_version: { schoolId, version: MAPPING_VERSION } },
      update: {},
      create: {
        schoolId,
        version: MAPPING_VERSION,
        effectiveDate: new Date(),
        entries: DEFAULT_MAPPING.entries as unknown as Prisma.InputJsonValue,
      },
    })
  }

  /**
   * Resolve the active mapping + chart for a school, seeding both if absent, and
   * rebuild a StandardChart whose mapping.entries come from the ACTIVE mapping row
   * (the source of truth) — NOT from DEFAULT_CHART — so a future custom mapping
   * flows through faithfully while staying reproducible.
   */
  async ensureActive(schoolId: string): Promise<ActiveMappingChart> {
    const [mapping, chartVersion] = await Promise.all([
      this.ensureMapping(schoolId),
      this.ensureChartVersion(),
    ])
    const storedChart = chartVersion.chart as unknown as StandardChart
    const chart: StandardChart = {
      standardChartVersion: chartVersion.version,
      categories: storedChart.categories ?? DEFAULT_CHART.categories,
      mapping: {
        mappingVersion: mapping.version,
        entries: mapping.entries as unknown as Record<number, string>,
      } as StandardChart['mapping'],
    }
    return { mapping, chartVersion, chart }
  }

  /** GET surface: active mapping/chart versions + entry count. */
  async getActive(schoolId: string) {
    const { mapping, chartVersion } = await this.ensureActive(schoolId)
    const entries = mapping.entries as Record<string, unknown>
    return {
      mappingVersion: mapping.version,
      standardChartVersion: chartVersion.version,
      entriesCount: Object.keys(entries ?? {}).length,
      effectiveDate: mapping.effectiveDate.toISOString().slice(0, 10),
    }
  }
}
