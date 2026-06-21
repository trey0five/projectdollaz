// Phase 4D+ — the AI assistant's LLM transport. OpenAI-compatible chat-completions
// with tool calling, via OpenRouter (routes to Claude). One round-trip per call;
// the agent loop in AssistantService handles multi-turn tool use. Config-gated.
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const TIMEOUT_MS = 30000

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}
export interface AssistantMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: ToolCall[]
}

@Injectable()
export class AssistantClient {
  constructor(private readonly config: ConfigService) {}

  /** Tool calling needs the OpenAI-compatible shape → OpenRouter. */
  isConfigured(): boolean {
    return (this.config.get<string>('openrouter.apiKey') ?? '').length > 0
  }

  async chat(messages: unknown[], tools: unknown[]): Promise<AssistantMessage> {
    const apiKey = this.config.get<string>('openrouter.apiKey') ?? ''
    const baseUrl = this.config.get<string>('openrouter.baseUrl') ?? 'https://openrouter.ai/api/v1'
    const model = this.config.get<string>('openrouter.model') ?? 'anthropic/claude-haiku-4.5'

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          'X-Title': 'finrep-assistant',
        },
        body: JSON.stringify({
          model,
          messages,
          tools,
          tool_choice: 'auto',
          max_tokens: 1200,
          temperature: 0.2,
        }),
        signal: controller.signal,
      })
      if (!res.ok) {
        throw new Error(`assistant LLM error ${res.status}`)
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: AssistantMessage }>
      }
      const msg = data.choices?.[0]?.message
      if (!msg) throw new Error('assistant LLM returned no message')
      return msg
    } finally {
      clearTimeout(timer)
    }
  }
}
