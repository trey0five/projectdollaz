// KYRO voice replies — server-side ElevenLabs text-to-speech proxy. The key
// stays here (never shipped to the browser). When ELEVENLABS_API_KEY is unset the
// controller answers 503 and the frontend falls back to the browser's
// SpeechSynthesis API, so spoken replies work out-of-the-box and auto-upgrade if
// a key is added. Mirrors AssistantClient's fetch + 30s AbortController shape.
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  PollyClient,
  SynthesizeSpeechCommand,
  type Engine,
  type VoiceId,
} from '@aws-sdk/client-polly'
import { Redactor } from './redaction.js'

/**
 * Privacy F4 — scrub spoken text before it leaves for the EXTERNAL TTS provider
 * (ElevenLabs). Masks emails and SSN-shaped runs via a fresh Redactor, then
 * strips any residual `[[…]]` placeholder token so a mask is never spoken
 * aloud. HONEST LIMIT: this is not name detection — a name KYRO was asked to
 * speak still reaches the provider; the mitigations for that are the
 * account-level ElevenLabs no-training opt-out (an ops setting, see
 * .env.example) and the no-penny-pii gate keeping names out of KYRO's own
 * answers in the first place. The in-account Polly path is deliberately
 * unscrubbed — it leaves no third party to scrub for.
 */
export function scrubSpokenText(text: string): string {
  let out = new Redactor(true).redactText(text)
  // Strip INNERMOST-first and loop until stable: a single greedy-ish pass over
  // nested tokens ("[[a [[b]] c]]") eats up to the first "]]" and leaves a
  // " c]]" residue to be spoken aloud. Bounded by the nesting depth.
  for (let prev = ''; prev !== out; ) {
    prev = out
    out = out.replace(/\[\[[^[\]]*\]\]/g, '')
  }
  return out
    .replace(/\[\[[^\]]*\]\]/g, '') // stray single brackets inside a token
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/**
 * Pronunciation for SPOKEN text only — never applied to displayed text. Every
 * voice we route to (Polly, ElevenLabs, the browser fallback) mangles "KYRO"
 * (letters, or "kee-ro"); the demo-VO convention spells it "Cairo", so the
 * assistant's own name is spoken the same way everywhere. Carries no digits,
 * so the narration value guard (value-safety.ts) is unaffected. Applied to
 * BOTH egress paths — the in-account Polly return and the scrubbed external
 * (ElevenLabs) payload.
 */
export function pronounceForSpeech(text: string): string {
  return text.replace(/\bKYRO\b/g, 'Cairo')
}

const TIMEOUT_MS = 30000
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/text-to-speech'

@Injectable()
export class AssistantTtsService {
  private readonly logger = new Logger(AssistantTtsService.name)
  private pollyClient: PollyClient | null = null

  constructor(private readonly config: ConfigService) {}

  /** In-account Polly is used when the assistant provider is Bedrock. */
  private get usePolly(): boolean {
    return (this.config.get<string>('assistant.provider') ?? 'openrouter') === 'bedrock'
  }

  /** Configured when Polly is active (task-role creds) or an ElevenLabs key is set. */
  isConfigured(): boolean {
    if (this.usePolly) return true
    return (this.config.get<string>('elevenlabs.apiKey') ?? '').length > 0
  }

  private getPolly(): PollyClient {
    if (!this.pollyClient) {
      this.pollyClient = new PollyClient({
        region: this.config.get<string>('polly.region') ?? 'us-east-1',
      })
    }
    return this.pollyClient
  }

  /** Amazon Polly → MP3 bytes. Voice changes vs ElevenLabs (a Polly neural voice). */
  private async pollySynthesize(text: string, voiceId?: string): Promise<Buffer> {
    const voice =
      (typeof voiceId === 'string' && voiceId.trim()) ||
      this.config.get<string>('polly.voiceId') ||
      'Joanna'
    const engine = this.config.get<string>('polly.engine') || 'neural'
    try {
      const res = await this.getPolly().send(
        new SynthesizeSpeechCommand({
          Text: text,
          OutputFormat: 'mp3',
          VoiceId: voice as VoiceId,
          Engine: engine as Engine,
        }),
      )
      if (!res.AudioStream) throw new BadGatewayException('Voice service returned no audio.')
      const bytes = await res.AudioStream.transformToByteArray()
      return Buffer.from(bytes)
    } catch (e) {
      if (e instanceof ServiceUnavailableException || e instanceof BadGatewayException) throw e
      this.logger.warn(`Polly TTS failed: ${e instanceof Error ? e.message : String(e)}`)
      throw new ServiceUnavailableException('Voice service is unreachable — using the browser voice.')
    }
  }

  /** Synthesize one text chunk to MP3 bytes. Callers must check isConfigured() first. */
  async synthesize(rawText: string, voiceId?: string): Promise<Buffer> {
    // Speech-only name pronunciation (KYRO → Cairo) on both paths.
    const text = pronounceForSpeech(rawText)
    if (this.usePolly) return this.pollySynthesize(text, voiceId)
    const apiKey = this.config.get<string>('elevenlabs.apiKey') ?? ''
    if (!apiKey) {
      // Should be guarded at the controller, but never call upstream without a key.
      throw new ServiceUnavailableException('Voice replies are not configured.')
    }
    const voice =
      (typeof voiceId === 'string' && voiceId.trim()) ||
      this.config.get<string>('elevenlabs.voiceId') ||
      'cgSgspJ2msm6clMCkdW9'
    const model = this.config.get<string>('elevenlabs.model') || 'eleven_turbo_v2_5'
    // External egress only — Polly (in-account) returned above, unscrubbed.
    const spoken = scrubSpokenText(text)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(
        `${ELEVENLABS_BASE}/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'content-type': 'application/json',
            accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: spoken,
            model_id: model,
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
          signal: controller.signal,
        },
      )
      if (!res.ok) {
        // 429 (rate-limited / quota) -> tell the client to fall back to browser TTS
        // exactly like the no-key case, rather than surfacing a hard error.
        if (res.status === 429) {
          this.logger.warn('ElevenLabs rate-limited (429) — signalling browser fallback.')
          throw new ServiceUnavailableException('Voice service is busy — using the browser voice.')
        }
        this.logger.warn(`ElevenLabs TTS upstream error ${res.status}.`)
        throw new BadGatewayException('Voice service returned an error.')
      }
      const ab = await res.arrayBuffer()
      return Buffer.from(ab)
    } catch (e) {
      if (e instanceof ServiceUnavailableException || e instanceof BadGatewayException) throw e
      // Network/abort/timeout — treat as a transient outage so the client falls back.
      this.logger.warn(`ElevenLabs TTS failed: ${e instanceof Error ? e.message : String(e)}`)
      throw new ServiceUnavailableException('Voice service is unreachable — using the browser voice.')
    } finally {
      clearTimeout(timer)
    }
  }
}
