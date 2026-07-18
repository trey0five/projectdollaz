// ─────────────────────────────────────────────────────────────────────────────
// BedrockClient — the in-account LLM transport (Amazon Bedrock, Claude via the
// provider-agnostic Converse API). Credentials come from the ECS task role (the
// default provider chain); nothing leaves your AWS account and Bedrock does not
// train on the data — the FERPA-clean path that replaces OpenRouter.
//
// It speaks the SAME OpenAI-shaped interface AssistantClient already uses
// (messages with role/content/tool_calls/tool_call_id; tools as {function}), so
// the agent loop + redaction in AssistantService are UNCHANGED. This class only
// translates OpenAI-shape ⇄ Bedrock Converse-shape.
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type Message,
  type Tool,
  type ToolConfiguration,
  type ContentBlock,
  type SystemContentBlock,
} from '@aws-sdk/client-bedrock-runtime'
import type { AssistantMessage } from './assistant.client.js'

interface OaiMsg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: unknown
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
  tool_call_id?: string
}
interface OaiTool {
  type: 'function'
  function: { name: string; description?: string; parameters?: unknown }
}

const MAX_TOKENS = 1200
const TEMPERATURE = 0.2

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

@Injectable()
export class BedrockClient {
  private readonly logger = new Logger(BedrockClient.name)
  private client: BedrockRuntimeClient | null = null

  constructor(private readonly config: ConfigService) {}

  private region(): string {
    return this.config.get<string>('assistant.bedrock.region') ?? 'us-east-1'
  }
  private modelId(): string {
    return (
      this.config.get<string>('assistant.bedrock.modelId') ??
      'anthropic.claude-3-5-haiku-20241022-v1:0'
    )
  }
  private getClient(): BedrockRuntimeClient {
    if (!this.client) this.client = new BedrockRuntimeClient({ region: this.region() })
    return this.client
  }

  // ── Translation: OpenAI messages → Converse {system, messages} ──────────────
  // Consecutive tool results are grouped into ONE user message of toolResult
  // blocks (Bedrock requires tool results to follow the assistant's toolUse in a
  // user turn), preserving the user/assistant alternation Converse enforces.
  private toConverse(messages: OaiMsg[]): { system: SystemContentBlock[]; msgs: Message[] } {
    const system: SystemContentBlock[] = []
    const msgs: Message[] = []
    let pending: ContentBlock[] = []
    // Bedrock requires strictly alternating user/assistant turns — coalesce any
    // consecutive same-role messages (e.g. two user turns in client history).
    const push = (role: 'user' | 'assistant', content: ContentBlock[]): void => {
      const last = msgs[msgs.length - 1]
      if (last && last.role === role) last.content = [...(last.content ?? []), ...content]
      else msgs.push({ role, content })
    }
    const flush = (): void => {
      if (pending.length) {
        push('user', pending)
        pending = []
      }
    }
    for (const m of messages) {
      if (m.role === 'system') {
        if (typeof m.content === 'string' && m.content) system.push({ text: m.content })
        continue
      }
      if (m.role === 'tool') {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
        pending.push({
          toolResult: {
            toolUseId: m.tool_call_id ?? '',
            content: [{ text: text || ' ' }], // Bedrock rejects empty text
          },
        })
        continue
      }
      flush()
      if (m.role === 'user') {
        push('user', this.toUserContent(m.content))
      } else {
        const content: ContentBlock[] = []
        if (typeof m.content === 'string' && m.content) content.push({ text: m.content })
        for (const tc of m.tool_calls ?? []) {
          // input is a Smithy DocumentType; assert through unknown.
          content.push({
            toolUse: {
              toolUseId: tc.id,
              name: tc.function.name,
              input: safeParse(tc.function.arguments),
            },
          } as unknown as ContentBlock)
        }
        if (!content.length) content.push({ text: ' ' })
        push('assistant', content)
      }
    }
    flush()
    return { system, msgs }
  }

  // Attachments (image/file blocks) are stripped upstream in FERPA mode; here we
  // keep only text blocks and drop anything else that slips through.
  private toUserContent(content: unknown): ContentBlock[] {
    if (typeof content === 'string') return [{ text: content || ' ' }]
    if (Array.isArray(content)) {
      const blocks: ContentBlock[] = []
      for (const b of content) {
        const bb = b as { type?: string; text?: string }
        if (bb?.type === 'text' && typeof bb.text === 'string') blocks.push({ text: bb.text })
      }
      return blocks.length ? blocks : [{ text: ' ' }]
    }
    return [{ text: ' ' }]
  }

  private toToolConfig(tools: OaiTool[]): ToolConfiguration | undefined {
    if (!tools?.length) return undefined
    // The JSON schema is passed through as a Smithy DocumentType; assert the
    // whole tagged-union Tool shape (AWS SDK unions don't match object literals).
    const specs = tools.map((t) => ({
      toolSpec: {
        name: t.function.name,
        description: t.function.description,
        inputSchema: { json: t.function.parameters ?? { type: 'object', properties: {} } },
      },
    })) as unknown as Tool[]
    return { tools: specs }
  }

  private fromContent(content: ContentBlock[] | undefined): AssistantMessage {
    let text = ''
    const tool_calls: NonNullable<AssistantMessage['tool_calls']> = []
    for (const block of content ?? []) {
      if (block.text) text += block.text
      else if (block.toolUse) {
        tool_calls.push({
          id: block.toolUse.toolUseId ?? `call_${block.toolUse.name ?? 'tool'}`,
          type: 'function',
          function: {
            name: block.toolUse.name ?? '',
            arguments: JSON.stringify(block.toolUse.input ?? {}),
          },
        })
      }
    }
    return { role: 'assistant', content: text || null, ...(tool_calls.length ? { tool_calls } : {}) }
  }

  // ── Public API (mirrors AssistantClient's unknown[] shape) ──────────────────
  async chat(messages: unknown[], tools: unknown[]): Promise<AssistantMessage> {
    const { system, msgs } = this.toConverse(messages as OaiMsg[])
    const res = await this.getClient().send(
      new ConverseCommand({
        modelId: this.modelId(),
        system: system.length ? system : undefined,
        messages: msgs,
        toolConfig: this.toToolConfig(tools as OaiTool[]),
        inferenceConfig: { maxTokens: MAX_TOKENS, temperature: TEMPERATURE },
      }),
    )
    return this.fromContent(res.output?.message?.content)
  }

  async streamChat(
    messages: unknown[],
    tools: unknown[],
    onDelta: (text: string) => void,
  ): Promise<AssistantMessage> {
    const { system, msgs } = this.toConverse(messages as OaiMsg[])
    const res = await this.getClient().send(
      new ConverseStreamCommand({
        modelId: this.modelId(),
        system: system.length ? system : undefined,
        messages: msgs,
        toolConfig: this.toToolConfig(tools as OaiTool[]),
        inferenceConfig: { maxTokens: MAX_TOKENS, temperature: TEMPERATURE },
      }),
    )
    let text = ''
    const toolBuf: Record<number, { id: string; name: string; input: string }> = {}
    for await (const event of res.stream ?? []) {
      const start = event.contentBlockStart
      if (start?.start?.toolUse) {
        toolBuf[start.contentBlockIndex ?? 0] = {
          id: start.start.toolUse.toolUseId ?? '',
          name: start.start.toolUse.name ?? '',
          input: '',
        }
        continue
      }
      const d = event.contentBlockDelta
      if (d?.delta) {
        const idx = d.contentBlockIndex ?? 0
        if (d.delta.text) {
          text += d.delta.text
          onDelta(d.delta.text)
        } else if (d.delta.toolUse?.input) {
          if (!toolBuf[idx]) toolBuf[idx] = { id: '', name: '', input: '' }
          toolBuf[idx].input += d.delta.toolUse.input
        }
      }
    }
    const tool_calls = Object.values(toolBuf)
      .filter((t) => t.name)
      .map((t) => ({
        id: t.id || `call_${t.name}`,
        type: 'function' as const,
        function: { name: t.name, arguments: t.input || '{}' },
      }))
    return { role: 'assistant', content: text || null, ...(tool_calls.length ? { tool_calls } : {}) }
  }

  /** Single-shot text (dashboard insight / briefing narration). No tools. */
  async invokeText(system: string | null, userText: string, maxTokens = 400): Promise<string | null> {
    const res = await this.getClient().send(
      new ConverseCommand({
        modelId: this.modelId(),
        system: system ? [{ text: system }] : undefined,
        messages: [{ role: 'user', content: [{ text: userText }] }],
        inferenceConfig: { maxTokens, temperature: TEMPERATURE },
      }),
    )
    const text = (res.output?.message?.content ?? [])
      .map((b) => b.text ?? '')
      .join('')
      .trim()
    return text || null
  }
}
