import { ArrayMinSize, IsArray, IsOptional, IsUUID } from 'class-validator'

/**
 * Route a task to one OR MORE approvers for sign-off. forbidNonWhitelisted-SAFE:
 * the two accepted fields are the LEGACY single approverUserId and the ORDERED
 * multi-step approverUserIds[] (any stray key 400s). The controller resolves
 * approverUserIds ?? [approverUserId] into a `string[]` for the service — so the
 * shipped single-field client AND the new ordered-chain client both work. The
 * service validates EACH id is an ACTIVE membership of the PATH school (400 else)
 * and requires at least one, so a cross-tenant / non-member / inactive / empty
 * approver set is impossible.
 */
export class SubmitTaskApprovalDto {
  /** Legacy single approver (a 1-step chain). */
  @IsOptional()
  @IsUUID()
  approverUserId?: string

  /** Ordered multi-step approval chain (step 1, then 2, …). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  approverUserIds?: string[]
}
