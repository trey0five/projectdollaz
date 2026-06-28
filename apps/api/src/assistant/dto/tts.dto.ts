import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * Penny voice reply request. The text is a single chunk to synthesize (the
 * frontend chunks by sentence and posts each). Capped at 2000 chars so a runaway
 * answer can't be turned into an enormous upstream TTS bill.
 */
export class TtsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  voiceId?: string
}
