// Phase 4D+ — the AI assistant's LLM transport. OpenAI-compatible chat-completions
// with tool calling, via OpenRouter (routes to Claude). One round-trip per call;
// the agent loop in AssistantService handles multi-turn tool use. Config-gated.
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BedrockClient } from './bedrock.client.js'

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
  constructor(
    private readonly config: ConfigService,
    private readonly bedrock: BedrockClient,
  ) {}

  private get provider(): string {
    return this.config.get<string>('assistant.provider') ?? 'openrouter'
  }

  /**
   * Bedrock (in-account) needs no key — creds come from the task role. OpenRouter
   * (dev) needs an API key.
   */
  isConfigured(): boolean {
    if (this.provider === 'bedrock') return true
    return (this.config.get<string>('openrouter.apiKey') ?? '').length > 0
  }

  async chat(messages: unknown[], tools: unknown[]): Promise<AssistantMessage> {
    if (this.provider === 'bedrock') return this.bedrock.chat(messages, tools)
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

  /**
   * Streaming variant: emits content tokens via onDelta as they arrive and returns
   * the fully-assembled message (content + any tool_calls, buffered per index).
   */
  async streamChat(
    messages: unknown[],
    tools: unknown[],
    onDelta: (text: string) => void,
  ): Promise<AssistantMessage> {
    if (this.provider === 'bedrock') return this.bedrock.streamChat(messages, tools, onDelta)
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
          stream: true,
        }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error(`assistant LLM error ${res.status}`)

      const reader = (res.body as ReadableStream<Uint8Array>).getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let content = ''
      const toolBuf: Record<number, { id: string; name: string; args: string }> = {}

      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const l = line.trim()
          if (!l.startsWith('data:')) continue
          const payload = l.slice(5).trim()
          if (payload === '[DONE]' || !payload) continue
          let chunk: { choices?: Array<{ delta?: { content?: string; tool_calls?: unknown[] } }> }
          try {
            chunk = JSON.parse(payload)
          } catch {
            continue
          }
          const delta = chunk.choices?.[0]?.delta
          if (!delta) continue
          if (typeof delta.content === 'string' && delta.content) {
            content += delta.content
            onDelta(delta.content)
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const raw of delta.tool_calls) {
              const tcd = raw as {
                index?: number
                id?: string
                function?: { name?: string; arguments?: string }
              }
              const idx = tcd.index ?? 0
              if (!toolBuf[idx]) toolBuf[idx] = { id: '', name: '', args: '' }
              if (tcd.id) toolBuf[idx].id = tcd.id
              if (tcd.function?.name) toolBuf[idx].name = tcd.function.name
              if (tcd.function?.arguments) toolBuf[idx].args += tcd.function.arguments
            }
          }
        }
      }

      const tool_calls = Object.values(toolBuf)
        .filter((t) => t.name)
        .map((t) => ({
          id: t.id || `call_${t.name}`,
          type: 'function' as const,
          function: { name: t.name, arguments: t.args || '{}' },
        }))
      return {
        role: 'assistant',
        content: content || null,
        ...(tool_calls.length ? { tool_calls } : {}),
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
