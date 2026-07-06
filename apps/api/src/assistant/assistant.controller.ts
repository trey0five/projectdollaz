import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { AssistantService } from './assistant.service.js'
import { AssistantTtsService } from './assistant-tts.service.js'
import { BriefingNarrationService } from './briefing-narration.service.js'
import { ChatDto } from './dto/chat.dto.js'
import { TtsDto } from './dto/tts.dto.js'
import { ApplyActionDto } from './dto/apply-action.dto.js'
import { NarrateBriefingDto } from './dto/narrate-briefing.dto.js'

/**
 * Phase 4D+ — AI assistant. Read-only Q&A over the school's financial data via a
 * tool-calling loop. Membership-checked by RolesGuard on :schoolId; open to all
 * roles (it never writes).
 */
@Controller('schools/:schoolId/assistant')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly tts: AssistantTtsService,
    private readonly narration: BriefingNarrationService,
  ) {}

  @Post('chat')
  @Roles('owner', 'accountant', 'viewer')
  chat(@Param('schoolId') schoolId: string, @Body() dto: ChatDto, @CurrentUser() user: User) {
    return this.assistant.chat(schoolId, dto.periodId ?? null, dto.messages, user)
  }

  /**
   * The narrated "morning brief" — a server-composed, VALIDATED narration of the
   * caller's lens-shaped briefing (segment array, source llm|template). Same guard
   * chain as chat; all roles (a board member gets the advisory brief too).
   */
  @Post('briefing-narration')
  @Roles('owner', 'accountant', 'viewer')
  narrateBriefing(
    @Param('schoolId') schoolId: string,
    @Body() dto: NarrateBriefingDto,
    @CurrentUser() user: User,
  ) {
    return this.narration.narrateSchool(schoolId, user, dto)
  }

  /** Streaming variant — Server-Sent Events (delta / status / chart / done). */
  @Post('chat/stream')
  @Roles('owner', 'accountant', 'viewer')
  async stream(
    @Param('schoolId') schoolId: string,
    @Body() dto: ChatDto,
    @Res() res: Response,
    @CurrentUser() user: User,
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
    await this.assistant.chatStream(
      schoolId,
      dto.periodId ?? null,
      dto.messages,
      emit,
      user,
      dto.attachments,
    )
    if (!closed) res.end()
  }

  /**
   * Penny voice replies — proxy a text chunk to ElevenLabs and stream the MP3.
   * Returns 503 when no ElevenLabs key is configured: that is the NORMAL dev state
   * and the FROZEN signal for the frontend to fall back to the browser's
   * SpeechSynthesis API, so it is not logged as an error.
   */
  @Post('tts')
  @Roles('owner', 'accountant', 'viewer')
  async ttsReply(
    @Param('schoolId') _schoolId: string,
    @Body() dto: TtsDto,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.tts.isConfigured()) {
      throw new ServiceUnavailableException('Voice replies are not configured.')
    }
    const mp3 = await this.tts.synthesize(dto.text, dto.voiceId)
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.end(mp3)
  }

  /** Apply a user-confirmed proposal (deterministic write). Owner/accountant only. */
  @Post('apply')
  @Roles('owner', 'accountant')
  apply(@Param('schoolId') schoolId: string, @Body() dto: ApplyActionDto, @CurrentUser() user: User) {
    return this.assistant.applyAction(schoolId, user, dto)
  }

  /** Penny's action log — the recent changes she made in this school. */
  @Get('activity')
  @Roles('owner', 'accountant')
  activity(@Param('schoolId') schoolId: string) {
    return this.assistant.listActivity(schoolId)
  }

  /** Undo one logged action (reverses the safely-reversible set). Owner/accountant only. */
  @Post('activity/:auditId/undo')
  @Roles('owner', 'accountant')
  undo(
    @Param('schoolId') schoolId: string,
    @Param('auditId') auditId: string,
    @CurrentUser() user: User,
  ) {
    return this.assistant.undoActivity(schoolId, user, auditId)
  }
}
