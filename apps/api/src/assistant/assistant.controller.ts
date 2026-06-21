import { Body, Controller, Param, Post, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { AssistantService } from './assistant.service.js'
import { ChatDto } from './dto/chat.dto.js'

/**
 * Phase 4D+ — AI assistant. Read-only Q&A over the school's financial data via a
 * tool-calling loop. Membership-checked by RolesGuard on :schoolId; open to all
 * roles (it never writes).
 */
@Controller('schools/:schoolId/assistant')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  @Roles('owner', 'accountant', 'viewer')
  chat(@Param('schoolId') schoolId: string, @Body() dto: ChatDto) {
    return this.assistant.chat(schoolId, dto.periodId ?? null, dto.messages)
  }

  /** Streaming variant — Server-Sent Events (delta / status / chart / done). */
  @Post('chat/stream')
  @Roles('owner', 'accountant', 'viewer')
  async stream(
    @Param('schoolId') schoolId: string,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()
    let closed = false
    res.on('close', () => {
      closed = true
    })
    const emit = (ev: unknown) => {
      if (!closed) res.write(`data: ${JSON.stringify(ev)}\n\n`)
    }
    await this.assistant.chatStream(schoolId, dto.periodId ?? null, dto.messages, emit)
    if (!closed) res.end()
  }
}
