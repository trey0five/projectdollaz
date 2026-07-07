import { IsBoolean } from 'class-validator'

/**
 * Toggle a school's automatic nightly QuickBooks sync. ONE whitelisted field so
 * the global forbidNonWhitelisted pipe is satisfied. Enabling re-arms auto-sync
 * (clears needs_reauth / reauth_notified_at / auto_sync_failures) in setAutoSync.
 */
export class QbAutoSyncDto {
  @IsBoolean()
  enabled!: boolean
}
