import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * The HUMAN status transition — the only writer of `status` in the whole system.
 *
 * `acknowledged` and `muted` are deliberately NOT offered here: they are set by
 * their own routes, which also write the mute window, so a status of
 * 'acknowledged' can never exist without the window that makes it mean anything.
 */
export class FindingStatusDto {
  @IsIn(['open', 'resolved', 'dismissed'])
  status!: 'open' | 'resolved' | 'dismissed'

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string
}
