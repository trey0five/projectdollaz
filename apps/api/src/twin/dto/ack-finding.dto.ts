import { IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * Acknowledge a finding: "I have seen this, come back to me in 45 days."
 *
 * An ack is NOT a resolution and this DTO deliberately offers no way to say it
 * is — the only status a human can set is on `FindingStatusDto`, behind its own
 * route, so acknowledging and closing can never be the same click.
 */
export class AckFindingDto {
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string
}
