import { createHash } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { generateInsight, type MetricResult } from '@finrep/analytics'
import { AnalyticsService } from './analytics.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { BedrockClient } from '../assistant/bedrock.client.js'

/** The insight endpoint response: the summary text + which path produced it. */
export interface InsightResponse {
  text: string
  source: 'rule' | 'llm'
}

/**
 * Phase 4D — AI insight summary.
 *
 * ALWAYS-ON baseline: the pure, deterministic rule-based generator in
 * @finrep/analytics. OPTIONAL upgrade: when ANTHROPIC_API_KEY is configured we
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
    const { periodId: fiscalPeriodId, metrics } =
      await this.analytics.computeMetricsResponse(schoolId, periodId)
    const fingerprint = this.fingerprint(metrics)

    const cached = await this.prisma.periodInsight.findUnique({
      where: { schoolId_fiscalPeriodId: { schoolId, fiscalPeriodId } },
    })
    if (cached && cached.fingerprint === fingerprint) {
      return { text: cached.text, source: cached.source === 'llm' ? 'llm' : 'rule' }
    }

    const result = await this.generate(metrics)

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
   * active provider so toggling an LLM key also invalidates the cache. */
  private fingerprint(metrics: MetricResult[]): string {
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
    return createHash('sha256').update(`${provider}::${compact}`).digest('hex')
  }

  /** Generate fresh: deterministic rule text, optionally upgraded by an LLM. */
  private async generate(metrics: MetricResult[]): Promise<InsightResponse> {
    const ruleText = generateInsight(metrics)
    if (!this.isConfigured()) {
      return { text: ruleText, source: 'rule' }
    }
    try {
      const llmText = await this.callLlm(metrics)
      if (llmText && llmText.trim().length > 0) {
        return { text: llmText.trim(), source: 'llm' }
      }
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
        const delta =
          m.periodOverPeriodDelta !== null
            ? `, change ${m.periodOverPeriodDelta >= 0 ? '+' : ''}${m.periodOverPeriodDelta}`
            : ''
        return `- ${m.label}: ${m.value} (${m.unit}), status ${m.status}${delta}`
      })
      .join('\n')

    return (
      'You are a school CFO assistant. Summarize this period’s financial health for a ' +
      'board as 3–4 short signals. Output ONE signal per line. Begin each line with a ' +
      'category tag in square brackets — [RISK], [WATCH], or [STRENGTH] — followed by a ' +
      'single concise, plain-language sentence (max ~14 words). Lead with the biggest ' +
      'risk; flag high tuition dependency if present; include at least one [STRENGTH] when ' +
      'warranted. No preamble, no markdown, no extra commentary — just the tagged lines.' +
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
