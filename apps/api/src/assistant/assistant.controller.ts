import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
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
}
