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
 *  is the only text field, overriding the parser's derived as-of date. */
export class EnrollmentUploadDto {
  @IsDateString()
  @IsOptional()
  observedOn?: string
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
