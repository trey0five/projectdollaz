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
import { GIFT_KINDS, GIFT_STATUSES } from './create-gift.dto.js'

/**
 * Patch a gift / pledge. ALL fields optional (partial PATCH). Hand-written (not
 * PartialType) so the forbidNonWhitelisted whitelist stays explicit. The COMMON case is
 * "record a payment on a pledge" — bump receivedAmount; the service RE-DERIVES status
 * (0→'pledged', 0<x<amount→'partial', ==amount→'received'). `status` is accepted ONLY as
 * the explicit 'written_off' override (any other value is ignored and re-derived from
 * receivedAmount) — it is @IsIn-validated so a garbage status still 400s. An OMITTED key
 * keeps the current value; an explicit `null` on a nullable field CLEARS it.
 *
 * STILL no donor PII field (see CreateGiftDto) — `label` is the only free-text tag.
 */
export class UpdateGiftDto {
  @IsOptional()
  @IsIn(GIFT_KINDS as unknown as string[])
  kind?: string

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  amount?: number

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  receivedAmount?: number

  @IsOptional()
  @IsIn(GIFT_STATUSES as unknown as string[])
  status?: string

  @IsOptional()
  @IsDateString()
  occurredOn?: string

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
