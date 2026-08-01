import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'

/**
 * Mute a finding for a stated number of days, WITH A STATED REASON.
 *
 * The reason is REQUIRED, not optional: a muted finding with no reason is
 * indistinguishable from a forgotten one six months later, and the ledger's whole
 * value is that a reader can tell the difference.
 *
 * `days: 0` is the UNMUTE — one route, one verb, no separate DELETE.
 * The 180-day ceiling is deliberate: a mute longer than an accreditation
 * half-cycle is a decision to stop tracking, which is what `dismissed` is for.
 */
export class MuteFindingDto {
  @IsInt()
  @Min(0)
  @Max(180)
  days!: number

  @IsString()
  @MinLength(1)
  @MaxLength(280)
  reason!: string
}
