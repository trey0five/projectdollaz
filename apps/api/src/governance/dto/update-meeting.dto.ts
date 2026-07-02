import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator'
import { MEETING_STATUSES, MINUTES_STATUSES, type MeetingStatus, type MinutesStatus } from './create-meeting.dto.js'

/**
 * Patch a meeting. ALL fields optional (partial PATCH). Hand-written so the
 * forbidNonWhitelisted whitelist stays explicit + the merge-pick is obvious: an
 * OMITTED key keeps the current value; an explicit `null` on a nullable field
 * CLEARS it (committeeId detaches, location/agenda/minutes/decisions clear).
 *
 * The Mark-approved transition is a normal PATCH with minutesStatus:'approved' —
 * the SERVICE stamps minutesApprovedAt + minutesApprovedByUserId; the client never
 * sends those, so they stay OFF this whitelist (a client-sent value 400s).
 */
export class UpdateMeetingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string

  @IsOptional()
  @IsUUID()
  committeeId?: string | null

  @IsOptional()
  @IsDateString()
  scheduledAt?: string

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
