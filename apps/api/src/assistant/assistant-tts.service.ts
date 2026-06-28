// Penny voice replies — server-side ElevenLabs text-to-speech proxy. The key
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

const TIMEOUT_MS = 30000
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/text-to-speech'

@Injectable()
export class AssistantTtsService {
  private readonly logger = new Logger(AssistantTtsService.name)

  constructor(private readonly config: ConfigService) {}

  /** True only when an ElevenLabs key is configured; otherwise the proxy 503s. */
  isConfigured(): boolean {
    return (this.config.get<string>('elevenlabs.apiKey') ?? '').length > 0
  }

  /** Synthesize one text chunk to MP3 bytes. Callers must check isConfigured() first. */
  async synthesize(text: string, voiceId?: string): Promise<Buffer> {
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
            text,
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
