// ─────────────────────────────────────────────────────────────────────────────
// THE ADVISORY SERVICE — the only place Phase J talks to a language model.
//
// Injects AssistantClient + ConfigService and NOTHING else: no Prisma, no clock,
// no domain service. It cannot read a figure, so it cannot leak one; everything it
// sends the model was already composed and already value-checked by the caller.
//
// FROZEN behaviour (§3):
//  1. `specs.length === 0` ⇒ templateComposition and the client is NEVER TOUCHED.
//  2. No LLM configured, client throws, times out, or returns unparseable text ⇒
//     the full deterministic composition with `source:'template'`. Never a 500,
//     never an empty answer. Penny degrades to the server's own words, which are
//     the MORE trustworthy ones — the fallback is not a downgrade.
//  3. The client is called with NO TOOLS (mirrors buildNarrationPrompt), ONE turn,
//     NO retry. A retry loop around a model that just produced garbage is how a
//     10s budget becomes a 90s hang on the one request that was already broken.
//  4. `compose` never reads the clock and never touches Prisma.
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AssistantClient } from './assistant.client.js'
import {
  composeAdvisory,
  parseAdvisoryJson,
  templateComposition,
  buildAdvisoryPrompt,
  type AdvisoryComposition,
  type AdvisorySegmentSpec,
} from './advisory-compose.js'

// Bounded far tighter than the client's own 30s cap — an advisory card must degrade
// to the (instant) template rather than hang a chat turn.
const LLM_TIMEOUT_MS = 10_000

@Injectable()
export class AdvisoryService {
  private readonly logger = new Logger(AdvisoryService.name)

  constructor(
    private readonly client: AssistantClient,
    private readonly config: ConfigService,
  ) {}

  async compose(
    mode: 'B' | 'C',
    audience: 'leadership' | 'board',
    specs: readonly AdvisorySegmentSpec[],
  ): Promise<AdvisoryComposition> {
    // (1) Nothing to phrase. Return BEFORE touching the client at all — not even
    // isConfigured(). "The model was never asked" has to be observable as zero
    // interactions, which is exactly what MB-1's spy asserts.
    if (specs.length === 0) return templateComposition(mode, [])

    if (!this.client.isConfigured()) return templateComposition(mode, specs)

    try {
      const messages = buildAdvisoryPrompt(mode, audience, specs)
      const msg = await this.race(this.client.chat(messages, []), this.timeoutMs())
      const parsed = parseAdvisoryJson(msg.content ?? '')
      // (2) Unparseable ⇒ full template. composeAdvisory(null) is that already, but
      // being explicit keeps the fallback one obvious line rather than an implication.
      // A model DID reply here — `modelCalled:true` — it simply said nothing usable.
      if (!parsed) return templateComposition(mode, specs, true)
      return composeAdvisory(mode, specs, parsed)
    } catch (e) {
      // Counts/reason only — never the (untrusted-input-derived) advisory text.
      this.logger.warn(
        `advisory LLM unavailable (mode ${mode}, ${specs.length} segments); serving template: ${errMsg(e)}`,
      )
      // Threw or timed out: no reply reached us, so no sentence here came from a
      // model and the card must not claim one was rejected.
      return templateComposition(mode, specs)
    }
  }

  private timeoutMs(): number {
    const v = this.config.get<number>('assistant.advisoryTimeoutMs')
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : LLM_TIMEOUT_MS
  }

  private race<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('advisory timeout')), ms)),
    ])
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
