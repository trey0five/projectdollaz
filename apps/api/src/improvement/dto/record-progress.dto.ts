import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { PROGRESS_EVENT_SOURCES, type ProgressEventSource } from '../improvement.constants.js'

/**
 * Record ONE observation against an initiative.
 *
 * The events table is APPEND-ONLY and carries a unique key on
 * (initiative, observedOn, source): re-recording the same day is a no-op update
 * of that one reading rather than a second point that fakes a denser series. A
 * projected completion date is only honest if the readings behind it were
 * recorded when they were true.
 */
export class RecordProgressDto {
  /** yyyy-mm-dd — the civil day the reading DESCRIBES, not the day it was typed. */
  @IsDateString()
  observedOn!: string

  @IsIn(PROGRESS_EVENT_SOURCES)
  source!: ProgressEventSource

  /** The RAW metric number at observedOn (source='metric'). */
  @IsOptional()
  @IsNumber()
  value?: number | null

  /** The 0..1 fraction toward target. A FRACTION, not a percentage. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  pct?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null
}
