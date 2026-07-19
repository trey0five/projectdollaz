import { Module } from '@nestjs/common'
import { BedrockClient } from './bedrock.client.js'

// Shared so both AssistantModule (chat/narration) and AnalyticsModule (dashboard
// insight) can inject the one in-account LLM transport. ConfigModule is global.
@Module({
  providers: [BedrockClient],
  exports: [BedrockClient],
})
export class BedrockModule {}
