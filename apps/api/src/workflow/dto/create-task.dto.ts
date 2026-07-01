import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator'

/** Task lifecycle status — a small closed enum (re-validated in the service). */
export const TASK_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Triage/sort hint — does NOT drive urgency (urgency is due-date-only). */
export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

/** The source-link discriminator (the "actionable pairing" — see the model). */
export const TASK_SOURCE_TYPES = ['manual', 'policy', 'metric', 'compliance'] as const
export type TaskSourceType = (typeof TASK_SOURCE_TYPES)[number]

/** Approval / sign-off lifecycle (Phase 3 v1). Co-located with TASK_STATUSES so the
 *  service, DTOs, and normalizer share ONE enum. Written only by the service state
 *  machine (submitForApproval/decide); the read path normalizes to 'none'. */
export const APPROVAL_STATUSES = ['none', 'pending', 'approved', 'rejected'] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

/** The two decisions an approver may record on a pending task. */
export const TASK_DECISIONS = ['approve', 'reject'] as const
export type TaskDecision = (typeof TASK_DECISIONS)[number]

/**
 * Create a task. forbidNonWhitelisted-SAFE: EVERY field is class-validator
 * decorated, so a stray/unknown key 400s. Nullable fields are `@IsOptional()`,
 * which — by class-validator semantics — skips validation for BOTH `undefined`
 * (omitted) AND `null` (explicit clear), so `null` passes the whitelist (same
 * pattern as the Policy DTO).
 *
 * createdByUserId is NOT accepted from the client — it is set server-side from the
 * authenticated caller (forbidNonWhitelisted would 400 it anyway).
 */
export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string | null

  @IsOptional()
  @IsDateString()
  dueDate?: string | null

  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus

  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: TaskPriority

  @IsOptional()
  @IsIn(TASK_SOURCE_TYPES)
  sourceType?: TaskSourceType | null

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceRef?: string | null
}
