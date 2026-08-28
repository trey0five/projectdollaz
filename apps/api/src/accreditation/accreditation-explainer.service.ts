import { Injectable, NotFoundException } from '@nestjs/common'
import { METRIC_META, type MetricKey } from '@finrep/analytics'
import type { CurrencyState, DataAvailability } from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { AccreditationService, type EvidenceSuggestion } from './accreditation.service.js'
import { AccreditationEvidenceReadinessService } from './evidence-readiness.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// WS3 F3 — the STANDARD EXPLAINER: one standard's whole story in one payload.
//
// A committee member (viewer role) opens a drawer and reads: the accreditor's
// verbatim statement, the authored plain-language translation (null → the UI
// renders NOTHING — no lorem, no LLM paraphrase), what good evidence looks like
// with each artifact's LIVE currency state, where the school stands on the
// rubric, and the deterministic attach suggestions. Composed ENTIRELY from
// existing machinery (catalog row + requirement currency + listSuggestions) —
// this service invents no state and does no arithmetic of its own.
//
// `whereItLives` strings are SERVER-AUTHORED here so Penny and print reuse the
// same words — the evidenceMeta.js semantics, owned once.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExplainerChecklistItem {
  tag: string
  label: string
  /** Server-authored register name ("Governance", "Knowledge documents", "Upload"). */
  whereItLives: string
  dataAvailability: DataAvailability
  /** Human window sentence ("Refresh every 24 months"); null when none applies. */
  window: string | null
  state: CurrencyState
  artifactCount: number
}

export interface ExplainerRubricStep {
  score: number
  label: string
  /** Long-form accreditor descriptor phrase; null when the accreditor has none. */
  descriptor: string | null
  current: boolean
}

export interface StandardExplainerResponse {
  code: string
  /** The row's own title (school edits respected). */
  title: string
  /** The catalog's VERBATIM statement; null on hand-made standards. */
  statement: string | null
  /** Authored plain-language layer; null → the drawer omits the block entirely. */
  plainLanguage: string | null
  keyCharacteristic: { code: string; label: string } | null
  rubric: ExplainerRubricStep[]
  evidenceChecklist: ExplainerChecklistItem[]
  /**
   * The bound operating signals (key + registry label). `availability` is NOT
   * computed here — the Signals tab is the value+availability surface, and this
   * module cannot reach it without a dependency cycle; null says "not claimed",
   * never "unavailable".
   */
  signals: { key: string; label: string; availability: null }[]
  /** The existing listSuggestions shape, reused verbatim. */
  suggestions: EvidenceSuggestion[]
}

/** sourceRegister → the server-authored "where it lives" noun. */
const WHERE_IT_LIVES: Record<string, string> = {
  policy: 'Governance policies',
  meeting: 'Governance meetings',
  strategic_plan: 'Strategic plan',
  period_budget: 'Budget workspace',
  enrollment_snapshot: 'Enrollment',
  knowledge_document: 'Knowledge documents',
  board_report: 'Board reports',
  maintenance_item: 'Facilities',
  staff_evaluation_register: 'HR staff evaluations',
  portal: "Your accreditor's portal",
  lms: 'LMS / assessment integration',
  professional_development: 'Professional development register',
  clearance_register: 'Safe-environment system',
}

@Injectable()
export class AccreditationExplainerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accreditation: AccreditationService,
    private readonly evidenceReadiness: AccreditationEvidenceReadinessService,
  ) {}

  async getExplainer(
    schoolId: string,
    standardId: string,
    now: Date = new Date(),
  ): Promise<StandardExplainerResponse> {
    // Tenant isolation first: a foreign/cross-tenant id resolves to null → 404
    // (the module's compound-lookup rule).
    const row = await this.prisma.accreditationStandard.findFirst({
      where: { id: standardId, schoolId },
    })
    if (!row) throw new NotFoundException('Standard not found.')

    const catalog = row.catalogStandardId
      ? await this.prisma.accreditationCatalogStandard.findFirst({
          where: { id: row.catalogStandardId },
          include: { parent: { select: { code: true, title: true } } },
        })
      : null

    const framework = row.frameworkId
      ? await this.prisma.accreditationFramework.findFirst({ where: { id: row.frameworkId } })
      : null

    // The rubric position: framework labels + (2025) long-form descriptors,
    // positional, with the school's current self-score marked.
    const labels = ((framework?.rubricLabels as string[] | undefined) ?? []).slice(0, 4)
    const descriptors = (framework?.rubricDescriptors as string[] | null | undefined) ?? null
    const rubric: ExplainerRubricStep[] = labels.map((label, i) => ({
      score: i + 1,
      label,
      descriptor: descriptors?.[i] ?? null,
      current: row.rubricScore === i + 1,
    }))

    // The live checklist: this standard's requirement currency, read from the
    // SAME build the Evidence Index serves (never a re-derivation). Fail-soft
    // to [] — a degraded currency read costs the checklist, not the drawer.
    const currency = await this.evidenceReadiness
      .getCurrencyByStandard(
        schoolId,
        row.frameworkId ? { frameworkId: row.frameworkId } : {},
        now,
      )
      .catch(() => null)
    const rowCurrency = currency?.byStandard[row.id] ?? []
    const evidenceChecklist: ExplainerChecklistItem[] = rowCurrency.map((c) => ({
      tag: c.tag,
      label: c.label,
      whereItLives: (c.sourceRegister ? WHERE_IT_LIVES[c.sourceRegister] : undefined) ?? 'Upload',
      dataAvailability: c.dataAvailability,
      window:
        c.windowKind === 'fixed' && c.windowMonths != null
          ? `Refresh every ${c.windowMonths} months`
          : c.windowKind === 'source_interval'
            ? "Follows its owning register's own review cycle"
            : null,
      state: c.state,
      artifactCount: c.artifacts.length,
    }))

    const metricLabelByKey = new Map(METRIC_META.map((m) => [m.key as string, m.label]))
    const signals = ((catalog?.signalKeys ?? []) as MetricKey[]).map((key) => ({
      key,
      label: metricLabelByKey.get(key) ?? key,
      availability: null as null,
    }))

    // The deterministic attach suggestions, REUSED VERBATIM ([] for hand-made rows).
    const { suggestions } = await this.accreditation
      .listSuggestions(schoolId, row.id)
      .catch(() => ({ suggestions: [] as EvidenceSuggestion[] }))

    return {
      code: row.code,
      title: row.title,
      statement: catalog?.title ?? null,
      plainLanguage: catalog?.plainLanguage ?? null,
      keyCharacteristic: catalog?.parent
        ? { code: catalog.parent.code, label: catalog.parent.title }
        : null,
      rubric,
      evidenceChecklist,
      signals,
      suggestions,
    }
  }
}
