import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { generateInsight, type MetricResult } from '@finrep/analytics'
import { AnalyticsService } from './analytics.service.js'

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
  ) {}

  /** True when any LLM provider key is configured (OpenRouter or Anthropic). */
  isConfigured(): boolean {
    return this.openrouterKey().length > 0 || this.anthropicKey().length > 0
  }

  private openrouterKey(): string {
    return this.config.get<string>('openrouter.apiKey') ?? ''
  }

  private anthropicKey(): string {
    return this.config.get<string>('anthropic.apiKey') ?? ''
  }

  /**
   * Build the insight for a period. Computes metrics via the SAME tenant-isolated
   * path as the metrics endpoint, runs the deterministic rule generator, then
   * optionally upgrades with Claude. Always resolves; never throws on LLM errors.
   */
  async insightFor(schoolId: string, periodId: string): Promise<InsightResponse> {
    // computeMetricsResponse enforces tenant isolation (getOwnedPeriod) + 404 on
    // no snapshot, exactly like the metrics endpoint.
    const { metrics } = await this.analytics.computeMetricsResponse(schoolId, periodId)
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
