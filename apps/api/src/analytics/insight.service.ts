import { createHash } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  formatMetricDelta,
  formatMetricValueLong,
  resolveDisplayUnit,
  type MetricResult,
} from '@finrep/analytics'
import { AnalyticsService } from './analytics.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { BedrockClient } from '../assistant/bedrock.client.js'
import { validateInsightReply } from './insight-reply.js'
import { generateInsightSignals } from './insight-rule.js'
import { guardInsightLines } from './insight-guard.js'

/**
 * Bumped when the reply gate or the rule fallback changes, so every cached
 * insight written under the old rules (a conversational "I'll need information
 * such as…" reply in v1, untagged rule prose in v2 — which the Finance page
 * showed as "Nothing flagged" while a metric was at risk) is regenerated once
 * instead of being served from cache forever. v4: the fingerprint also carries
 * the snapshot's generated-at time, so a re-saved / remapped year never reuses
 * the insight written about its previous numbers (see insight-cache.ts). v5:
 * LLM lines pass the value guard (insight-guard.ts) and balance-sheet metrics
 * are unavailable on a year with no balance sheet — cached text predating
 * either is regenerated.
 */
export const INSIGHT_CACHE_VERSION = 'v5'

/** The insight endpoint response: the summary text + which path produced it. */
export interface InsightResponse {
  text: string
  source: 'rule' | 'llm'
  /** ISO time the snapshot this insight describes was generated (additive). */
  dataAsOf?: string
}

/**
 * Phase 4D — AI insight summary.
 *
 * ALWAYS-ON baseline: the pure, deterministic TAGGED rule generator
 * (insight-rule.ts, same sentences as @finrep/analytics generateInsight). OPTIONAL upgrade: when ANTHROPIC_API_KEY is configured we
 * ask Claude for a richer 1–3 sentence board-level narrative. On ANY error
 * (no key, network, timeout, parse, rate-limit) we fall back to the rule text —
 * this NEVER throws and NEVER blocks the dashboard (mirrors the StripeClient
 * keyless-boot pattern). Verifiable with NO key: returns { source: 'rule' }.
 *
 * The LLM call lives ONLY here in the API — the analytics package stays pure.
 */
@Injectable()
export class InsightService {
  private readonly logger = new Logger(InsightService.name)
  private static readonly TIMEOUT_MS = 8000

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly bedrock: BedrockClient,
  ) {}

  private llmProvider(): string {
    return this.config.get<string>('assistant.provider') ?? 'openrouter'
  }

  /** True when Bedrock is selected (task-role creds) or an LLM key is configured. */
  isConfigured(): boolean {
    if (this.llmProvider() === 'bedrock') return true
    return this.openrouterKey().length > 0 || this.anthropicKey().length > 0
  }

  private openrouterKey(): string {
    return this.config.get<string>('openrouter.apiKey') ?? ''
  }

  private anthropicKey(): string {
    return this.config.get<string>('anthropic.apiKey') ?? ''
  }

  /**
   * Insight for a period, CACHED by a fingerprint of the metrics. Repeated loads
   * with unchanged data reuse the stored text (no LLM re-bill, stable wording); a
   * data change (new snapshot, edited operational inputs) changes the fingerprint
   * and regenerates. computeMetricsResponse enforces tenant isolation + 404.
   */
  async insightFor(schoolId: string, periodId: string): Promise<InsightResponse> {
    const { periodId: fiscalPeriodId, metrics, freshness } =
      await this.analytics.computeMetricsResponse(schoolId, periodId)
    const dataAsOf = freshness?.dataAsOf
    const fingerprint = this.fingerprint(metrics, dataAsOf)

    const cached = await this.prisma.periodInsight.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } },
    })
    if (cached && cached.fingerprint === fingerprint) {
      // Belt and braces: a cached LLM text must still pass today's reply gate.
      if (cached.source !== 'llm') return { text: cached.text, source: 'rule', dataAsOf }
      const ok = validateInsightReply(cached.text)
      const guarded = ok ? guardInsightLines(ok, metrics).text : null
      if (guarded) return { text: guarded, source: 'llm', dataAsOf }
    }

    const result: InsightResponse = { ...(await this.generate(metrics)), dataAsOf }

    // Best-effort cache write — never fail the response on a write error.
    try {
      await this.prisma.periodInsight.upsert({
        where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } },
        create: { schoolId, fiscalPeriodId, fingerprint, text: result.text, source: result.source },
        update: { fingerprint, text: result.text, source: result.source },
      })
    } catch (err) {
      this.logger.warn(
        `insight cache write failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    return result
  }

  /** Deterministic hash of the metric values that drive the insight. Includes the
   * active provider so toggling an LLM key also invalidates the cache, and the
   * snapshot's generated-at time so a rebuilt period never reuses the old text. */
  private fingerprint(metrics: MetricResult[], dataAsOf?: string): string {
    const compact = metrics
      .map(
        (m) =>
          `${m.key}:${m.available ? m.value : 'x'}:${m.status}:${m.periodOverPeriodDelta ?? 'x'}`,
      )
      .join('|')
    const provider =
      this.llmProvider() === 'bedrock'
        ? 'br'
        : this.isConfigured()
          ? this.openrouterKey()
            ? 'or'
            : 'an'
          : 'rule'
    return createHash('sha256')
      .update(`${INSIGHT_CACHE_VERSION}::${provider}::${dataAsOf ?? 'x'}::${compact}`)
      .digest('hex')
  }

  /**
   * Generate fresh: deterministic rule text, optionally upgraded by an LLM.
   * The LLM is NEVER called when the school has no available metric — with
   * nothing to summarize a model can only chat back ("I'll need information
   * such as…"), and that must never surface as a warning. Its reply is accepted
   * only as tagged signals (validateInsightReply); anything else → rule text.
   * The rule text is TAGGED too (generateInsightSignals): the Finance Warnings
   * grid only tiles tagged lines, so an untagged fallback would read as
   * "Nothing flagged" while a metric is at risk.
   */
  private async generate(metrics: MetricResult[]): Promise<InsightResponse> {
    const ruleText = generateInsightSignals(metrics)
    if (!this.isConfigured() || !hasAvailableMetric(metrics)) {
      return { text: ruleText, source: 'rule' }
    }
    try {
      const llmText = validateInsightReply(await this.callLlm(metrics))
      if (llmText) {
        // Value guard: every figure + status must match the metric it names;
        // a failing line becomes that metric's rule sentence.
        const guarded = guardInsightLines(llmText, metrics)
        if (guarded.replaced || guarded.dropped) {
          this.logger.warn(
            `insight value guard: ${guarded.replaced} line(s) replaced by the rule sentence, ${guarded.dropped} dropped`,
          )
        }
        if (guarded.text) return { text: guarded.text, source: 'llm' }
        this.logger.warn('no Claude insight line passed the value guard; using the rule-based summary')
        return { text: ruleText, source: 'rule' }
      }
      this.logger.warn('Claude insight reply was not a list of tagged signals; using the rule-based summary')
    } catch (err) {
      this.logger.warn(
        `Claude insight upgrade failed; falling back to rule-based summary: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
    return { text: ruleText, source: 'rule' }
  }

  /** Board-level prompt built from the available metrics (provider-agnostic). */
  private buildPrompt(metrics: MetricResult[]): string {
    const lines = metrics
      .filter((m) => m.available && m.value !== null)
      .map((m) => {
        // FORMATTED values (25.8%, 152 days) — never the raw fraction, which
        // the model once read as "0.26%" beside a 25.8% card.
        const unit = resolveDisplayUnit(m.key, m.unit)
        const d = formatMetricDelta(m.periodOverPeriodDelta, unit)
        const delta = d ? `, change vs prior year ${d}` : ''
        return `- ${m.label}: ${formatMetricValueLong(m.value, unit)}, status ${m.status}${delta}`
      })
      .join('\n')

    return (
      'You are a school CFO assistant. Summarize this period’s financial health for a ' +
      'board as 3–4 short signals. Output ONE signal per line. Begin each line with a ' +
      'category tag in square brackets — [RISK], [WATCH], or [STRENGTH] — followed by a ' +
      'single concise, plain-language sentence (max ~14 words). Lead with the biggest ' +
      'risk; flag high tuition dependency if present; include at least one [STRENGTH] when ' +
      'warranted. No preamble, no markdown, no extra commentary — just the tagged lines. ' +
      'Never ask questions or request more information; use only the metrics below. ' +
      'Name the metric in each line and quote its figure EXACTLY as written below; tag ' +
      'it to match its status (risk → [RISK], watch → [WATCH], good → [STRENGTH]). ' +
      'Never mention a metric that is not listed (for example cash or reserves when ' +
      'they are absent).' +
      '\n\nExample:\n[RISK] Tuition dependency is 87% of revenue, leaving little buffer.\n' +
      '[WATCH] Cash on hand is 43 days; monitor liquidity.\n[STRENGTH] Operating reserve ' +
      'covers seven months of expenses.\n\nMetrics:\n' +
      lines
    )
  }

  /**
   * Generate the narrative via an LLM. Prefers OpenRouter (OpenAI-compatible,
   * routes to Claude) when its key is set, else the native Anthropic Messages API.
   * Times out so a slow/erroring provider can never block the dashboard.
   */
  private async callLlm(metrics: MetricResult[]): Promise<string | null> {
    const prompt = this.buildPrompt(metrics)
    // Bedrock (in-account) is the compliant path; aggregate KPIs only, no PII.
    if (this.llmProvider() === 'bedrock') {
      return this.withTimeout(this.bedrock.invokeText(null, prompt, 200))
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), InsightService.TIMEOUT_MS)
    try {
      return this.openrouterKey().length > 0
        ? await this.callOpenRouter(prompt, controller.signal)
        : await this.callAnthropic(prompt, controller.signal)
    } finally {
      clearTimeout(timer)
    }
  }

  /** Bound a promise by the insight timeout; a timeout rejects → rule fallback. */
  private withTimeout<T>(p: Promise<T>): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('LLM timeout')), InsightService.TIMEOUT_MS),
      ),
    ])
  }

  /** OpenRouter (OpenAI-compatible chat completions) → Claude. */
  private async callOpenRouter(prompt: string, signal: AbortSignal): Promise<string | null> {
    const baseUrl =
      this.config.get<string>('openrouter.baseUrl') ?? 'https://openrouter.ai/api/v1'
    const model = this.config.get<string>('openrouter.model') ?? 'anthropic/claude-haiku-4.5'
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.openrouterKey()}`,
        'X-Title': 'finrep',
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
        // Privacy F3 — same per-request zero-data-retention flags AssistantClient
        // sends (verified field names: provider.data_collection / provider.zdr).
        // A routing failure under these flags is a config error to surface (the
        // dashboard falls back to the rule-based insight); never retried bare.
        ...((this.config.get<boolean>('assistant.llmZdr') ?? true)
          ? { provider: { data_collection: 'deny', zdr: true } }
          : {}),
      }),
      signal,
    })
    if (!res.ok) {
      throw new Error(`OpenRouter API ${res.status}`)
    }
    return extractOpenAiText(await res.json())
  }

  /** Native Anthropic Messages API. */
  private async callAnthropic(prompt: string, signal: AbortSignal): Promise<string | null> {
    const model = this.config.get<string>('anthropic.model') ?? 'claude-haiku-4-5'
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.anthropicKey(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal,
    })
    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}`)
    }
    return extractAnthropicText(await res.json())
  }
}

/** True when at least one metric has a real value to summarize. */
export function hasAvailableMetric(metrics: MetricResult[]): boolean {
  return metrics.some((m) => m.available && m.value !== null)
}

/** Pull the first text block out of an Anthropic Messages response. */
function extractAnthropicText(data: unknown): string | null {
  if (
    data &&
    typeof data === 'object' &&
    'content' in data &&
    Array.isArray((data as { content: unknown }).content)
  ) {
    const blocks = (data as { content: Array<{ type?: string; text?: string }> }).content
    const textBlock = blocks.find((b) => b.type === 'text' && typeof b.text === 'string')
    return textBlock?.text ?? null
  }
  return null
}

/** Pull the message content out of an OpenAI-compatible chat-completions response. */
function extractOpenAiText(data: unknown): string | null {
  if (
    data &&
    typeof data === 'object' &&
    'choices' in data &&
    Array.isArray((data as { choices: unknown }).choices)
  ) {
    const choices = (data as { choices: Array<{ message?: { content?: string } }> }).choices
    const content = choices[0]?.message?.content
    return typeof content === 'string' ? content : null
  }
  return null
}
