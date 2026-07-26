import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'

/** Bid lifecycle vocabulary (TEXT column + @IsIn convention — no PG enum). */
export const BID_STATUSES = ['pending', 'accepted', 'rejected'] as const
export type BidStatus = (typeof BID_STATUSES)[number]

/**
 * Add a competing vendor quote to a maintenance item. SERVICE INVARIANTS (not
 * expressible as field validators): at least ONE of vendorId/vendorName must be
 * present (400 otherwise); vendorId must belong to the path school; the item must
 * not be resolved. `status` is NEVER client-writable — a bid is born 'pending' and
 * only the owner-only accept/reopen endpoints move it (forbidNonWhitelisted 400s
 * a stray status key).
 */
export class CreateBidDto {
  @IsOptional()
  @IsUUID()
  vendorId?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendorName?: string | null

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  amount!: number

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null
}

/** Partial PATCH — allowed ONLY while the bid is still 'pending' (service gate). */
export class UpdateBidDto {
  @IsOptional()
  @IsUUID()
  vendorId?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendorName?: string | null

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  amount?: number

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null
}

/** Leadership (owner-only) accept — optional decision note stamped on the ITEM. */
export class AcceptBidDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null
}
