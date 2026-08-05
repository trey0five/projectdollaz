import { BadRequestException, Injectable } from '@nestjs/common'
import type { Mapping, Prisma, StandardChartVersion } from '@finrep/db'
import {
  categoryDef,
  DEFAULT_CHART,
  DEFAULT_MAPPING,
  MAPPING_VERSION,
  STANDARD_CHART_VERSION,
  type SCoaCategory,
  type StandardChart,
} from '@finrep/engine'
import { PrismaService } from '../prisma/prisma.service.js'
import type { SpreadMappingOverrides } from '../analytics/budget.spread.js'

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
      // Same reasoning as the mapping below: the stored chart row is seeded per
      // VERSION, so a row written under an older version knows nothing about
      // categories added since. Defaults underneath, stored values on top.
      categories: { ...DEFAULT_CHART.categories, ...(storedChart.categories ?? {}) },
      descriptionRules: storedChart.descriptionRules ?? DEFAULT_CHART.descriptionRules,
      mapping: {
        mappingVersion: mapping.version,
        // THE DEFAULTS UNDERNEATH, THE SCHOOL'S PICKS ON TOP.
        //
        // This row was seeded once, on the school's first use, and never
        // revisited — so a school seeded before the balance sheet became
        // mapping-driven holds only its income-statement entries. Reading the
        // stored row alone would hand the engine a chart with no cash, no
        // receivables and no liabilities, and every existing school's balance
        // sheet would go to zero the moment the statements started reading
        // categories. Unioning at READ time means new defaults reach every
        // school without a migration or a DML pass, while anything the school
        // has actually chosen still wins.
        entries: {
          ...(DEFAULT_MAPPING.entries as unknown as Record<number, string>),
          ...(mapping.entries as unknown as Record<number, string>),
        },
      } as StandardChart['mapping'],
    }
    return { mapping, chartVersion, chart }
  }

  /**
   * The school's saved per-row category overrides, keyed exactly as
   * spreadRowKey() (numeric GL strings + `label:`-prefixed label keys). Returned
   * verbatim from the active Mapping.entries: numeric GL keys equal what
   * categoryOf already yields (so passing them as overrides is a no-op for those
   * rows), while user-saved `label:` keys and any re-pointed GL keys take effect.
   * rollupSpread defensively ignores any value that isn't a real SCoA category.
   */
  async getSpreadOverrides(schoolId: string): Promise<SpreadMappingOverrides> {
    const { mapping } = await this.ensureActive(schoolId)
    return (mapping.entries as unknown as SpreadMappingOverrides) ?? {}
  }

  /**
   * Merge user-chosen account→category picks into the active Mapping.entries
   * IN PLACE (same version — matches the seed-on-read, single-active-row model; no
   * version churn). Keys must be a finite GL-number string OR a `label:`-prefixed
   * key; values must be a real SCoA category. Invalid keys/values 400 (so a bad
   * value never poisons entries and later breaks getSpreadOverrides). Never
   * deletes existing entries.
   */
  async mergeEntries(
    schoolId: string,
    patch: Record<string, string>,
  ): Promise<{ mappingVersion: string; entriesCount: number; merged: number }> {
    const validated: Record<string, string> = {}
    const badCategories: string[] = []
    const badKeys: string[] = []
    for (const [key, value] of Object.entries(patch ?? {})) {
      // GL keys must be positive integers (matches spreadRowKey, which only emits
      // `String(acct)` for acct>0); reject "0" / decimals / non-numeric.
      const okKey = key.startsWith('label:')
        ? key.length > 'label:'.length
        : /^\d+$/.test(key) && Number(key) > 0
      if (!okKey) {
        badKeys.push(key)
        continue
      }
      if (!categoryDef(value as SCoaCategory)) {
        badCategories.push(value)
        continue
      }
      validated[key] = value
    }
    if (badKeys.length) {
      throw new BadRequestException(`Invalid mapping key(s): ${badKeys.join(', ')}`)
    }
    if (badCategories.length) {
      throw new BadRequestException(`Unknown category value(s): ${badCategories.join(', ')}`)
    }

    const { mapping } = await this.ensureActive(schoolId)

    // ATOMIC MERGE, IN ONE STATEMENT.
    //
    // This was a read-modify-write: load entries, spread the patch over them,
    // write the whole object back. Two categorisations landing together read
    // the same "before" and the second overwrote the first — and the intake's
    // review panel is exactly where a person categorises a run of accounts in
    // quick succession. Caught with a 33-account trial balance: eleven picks
    // survived and the rest vanished silently, leaving a school with numbers
    // that were wrong rather than merely absent.
    //
    // `||` is Postgres' jsonb concatenation: right-hand keys win, the read and
    // the write are the same statement, so concurrent merges cannot lose each
    // other. Prisma has no typed operator for it, hence the raw query.
    const rows = await this.prisma.$queryRaw<{ entries: Record<string, string> }[]>`
      UPDATE mappings
         SET entries = entries || ${JSON.stringify(validated)}::jsonb
       WHERE id = ${mapping.id}::uuid
      RETURNING entries
    `
    const next = rows[0]?.entries ?? {}
    return {
      mappingVersion: mapping.version,
      entriesCount: Object.keys(next).length,
      merged: Object.keys(validated).length,
    }
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
