import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator'

/** Meeting lifecycle status — a small closed enum (re-validated in the service). */
export const MEETING_STATUSES = ['scheduled', 'held', 'cancelled'] as const
export type MeetingStatus = (typeof MEETING_STATUSES)[number]

/** Minutes-approval lifecycle — a small closed enum (re-validated in the service). */
export const MINUTES_STATUSES = ['none', 'draft', 'pending_approval', 'approved'] as const
export type MinutesStatus = (typeof MINUTES_STATUSES)[number]

/**
 * Create a meeting. forbidNonWhitelisted-SAFE: EVERY field is class-validator
 * decorated. `committeeId` is an OPTIONAL, nullable FK — the SERVICE validates it
 * is SAME-SCHOOL (a forged/foreign id → 404), never trusting the client value.
 *
 * NOTE: minutesApprovedAt / minutesApprovedByUserId are NOT client-writable — they
 * are stamped by the service on the minutesStatus→'approved' transition (or the
 * dedicated approve action). They are deliberately absent here, so a client-sent
 * value 400s under forbidNonWhitelisted (a forged approval timestamp/approver is
 * impossible).
 */
export class CreateMeetingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsUUID()
  committeeId?: string | null

  @IsDateString()
  scheduledAt!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null

  @IsOptional()
  @IsIn(MEETING_STATUSES)
  status?: MeetingStatus

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  agenda?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  minutes?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  decisions?: string | null

  @IsOptional()
  @IsIn(MINUTES_STATUSES)
  minutesStatus?: MinutesStatus
}
