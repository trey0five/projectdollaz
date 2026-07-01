import { IsUUID } from 'class-validator'

/**
 * Route a task to a single approver for sign-off. forbidNonWhitelisted-SAFE: the
 * ONLY accepted field is approverUserId (any stray key 400s). approverUserId is
 * REQUIRED and non-null — an approval cannot exist without an approver. The service
 * additionally validates it is an ACTIVE membership of the PATH school (400 else),
 * so a cross-tenant / non-member / inactive approver is impossible.
 */
export class SubmitTaskApprovalDto {
  @IsUUID()
  approverUserId!: string
}
