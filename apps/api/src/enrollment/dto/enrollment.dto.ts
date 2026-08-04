import { IsDateString, IsIn, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator'
import type { EnrollmentProviderKey } from '@finrep/db'

/**
 * The provider keys — MUST stay in lockstep with the Prisma EnrollmentProvider enum
 * and @finrep/db's EnrollmentProviderKey. Used by @IsIn so a bad provider 400s.
 */
export const ENROLLMENT_PROVIDERS: EnrollmentProviderKey[] = [
  'oneroster_csv',
  'oneroster_api',
  'blackbaud',
  'facts',
  'veracross',
  'manual',
  'diocesan_csv',
  'diocesan_api',
]

/** The providers a school connects with API keys (not OAuth, not file upload). */
export const KEY_PROVIDERS: EnrollmentProviderKey[] = ['blackbaud', 'facts', 'veracross', 'oneroster_api']

/** OAuth callback: the frontend posts the code it received from the SIS. realmId is
 *  accepted for QBO-shape parity but unused by Blackbaud (kept optional). */
export class EnrollmentCallbackDto {
  @IsString()
  @MinLength(1)
  code!: string

  @IsString()
  @IsOptional()
  realmId?: string
}

/** Connect a key/basic provider (FACTS, Veracross, OneRoster REST — or a Blackbaud
 *  subscription key). Every field decorated so forbidNonWhitelisted stays happy. */
export class EnrollmentConnectKeyDto {
  @IsIn(ENROLLMENT_PROVIDERS)
  provider!: EnrollmentProviderKey

  @IsString()
  @IsOptional()
  apiKeyId?: string

  @IsString()
  @IsOptional()
  apiKeySecret?: string

  @IsString()
  @IsOptional()
  baseUrl?: string

  @IsString()
  @IsOptional()
  externalOrgId?: string

  @IsString()
  @IsOptional()
  subscriptionKey?: string
}

/** Multipart upload: the ZIP/CSV file is @UploadedFile (NOT in the DTO); observedOn
 *  overrides the parser's derived as-of date and `mode` picks how the per-student
 *  rows the file carries are reconciled with the register. Multipart text fields
 *  arrive as strings, so no @Transform is needed. */
export class EnrollmentUploadDto {
  @IsDateString()
  @IsOptional()
  observedOn?: string

  /**
   * How the file's per-student rows meet the existing roster: 'merge' (default —
   * match on sourcedId, then name+birthDate, create the rest) or 'replace' (swap
   * the whole roster). Same two words, same semantics, as the reviewed importer.
   */
  @IsOptional()
  @IsIn(['merge', 'replace'])
  mode?: 'merge' | 'replace'

  /**
   * WHICH FISCAL YEAR THIS ROSTER COUNTS FOR — the decision the uploader is
   * actually making, stated instead of inferred.
   *
   * Before this existed the year was DERIVED from `observedOn`, which defaults to
   * today. The fiscal year runs Jul–Jun, so an August upload silently landed in
   * the NEXT year: a real school's 436 students went to FY 2027 while their ledger
   * and every finance metric sat in FY 2026, still computing from a hand-entered
   * 1200 (cost per pupil $8,683 against 1200, $23,899 against 436). The upload was
   * correct and the numbers never moved, and nothing on screen said so.
   *
   * `observedOn` IS NOT REPLACED by this, because it is not a period selector: it
   * is the reading's position on the time axis, it is the idempotency key
   * (`@@unique([schoolId, sourceId, observedOn])`), and the enrollment trend is
   * drawn from several readings within one year — September's official count,
   * January's, May's. Collapsing the two would make a second upload in the same
   * year overwrite the first and flatten the trend to a single point.
   *
   * When present it wins outright; when absent the old date-derived behaviour is
   * byte-identical, so every existing caller and integration is unaffected.
   */
  @IsOptional()
  @IsUUID()
  fiscalPeriodId?: string
}

/** Live sync of the connected provider as of an optional date. */
export class EnrollmentSyncDto {
  @IsDateString()
  @IsOptional()
  asOf?: string
}

/** Hand-entered snapshot: an as-of date + a byGrade map (validated in the service
 *  against GRADE_KEYS — @IsObject keeps forbidNonWhitelisted from rejecting it). */
export class EnrollmentManualDto {
  @IsDateString()
  observedOn!: string

  @IsObject()
  byGrade!: Record<string, number>
}

/** Revert a manual-supersede for one period (restores the backed-up manual value). */
export class EnrollmentRevertManualDto {
  @IsUUID()
  periodId!: string
}
