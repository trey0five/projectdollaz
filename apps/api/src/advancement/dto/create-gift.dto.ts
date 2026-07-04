import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

/** Exported enum arrays so the service, tests, and FE stay in sync with the DTO. */
export const GIFT_KINDS = ['gift', 'pledge'] as const
export const GIFT_STATUSES = ['received', 'pledged', 'partial', 'written_off'] as const

/**
 * Create a gift / pledge under a campaign. forbidNonWhitelisted-SAFE: EVERY field is
 * class-validator decorated, so a stray/unknown key 400s.
 *
 * AGGREGATE-ONLY / NO per-donor PII (see the AdvancementGift model comment): there is
 * DELIBERATELY no donor name/email/address field. `label` is an OPTIONAL, length-capped,
 * NON-IDENTIFYING free-text tag ('Spring appeal', 'Anonymous major gift') — never a name.
 *
 * status is NOT accepted on create — the service DERIVES it: a 'gift' ⇒ received = amount,
 * status 'received'; a 'pledge' ⇒ receivedAmount ∈ [0, amount], status 0→'pledged',
 * 0<x<amount→'partial', ==amount→'received'. amount/receivedAmount are bounded 2-dp
 * non-negative numbers (mirrors the campaign goal/raised bounds).
 */
export class CreateGiftDto {
  @IsIn(GIFT_KINDS as unknown as string[])
  kind!: string

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  amount!: number

  /** Received so far (pledge only). Omitted/ignored for a gift (forced to amount). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  receivedAmount?: number

  @IsDateString()
  occurredOn!: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string | null
}
