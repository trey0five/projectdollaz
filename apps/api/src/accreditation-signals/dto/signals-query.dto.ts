import { IsOptional, IsUUID } from 'class-validator'

/**
 * Query DTO for GET /schools/:schoolId/accreditation/signals.
 *
 * EVERY field must be explicitly decorated — the global forbidNonWhitelisted
 * ValidationPipe rejects any unknown/undecorated property with a 400, which is
 * exactly right: a typo'd param must fail loudly rather than be silently ignored
 * and answered with signals from a period the caller did not ask for.
 *
 * Default applied by the service, NOT here: the newest fiscal period that
 * actually has saved statements.
 */
export class SignalsQueryDto {
  /** Fiscal period whose statements the signals describe. Tenant-checked. */
  @IsOptional()
  @IsUUID()
  periodId?: string

  /**
   * Which adopted framework the GRADED population belongs to. Omitted ⇒ the
   * dominant one, exactly as before.
   *
   * A school holding two accreditations was silently graded on whichever had
   * more standards, so this panel and the readiness hero could only ever
   * describe that one — the other framework's standards sat in the register
   * contributing to nothing. The readiness and evidence-readiness routes already
   * took this param; the signals panel is one of the two that did not, which is
   * how a page-wide framework choice could not reach it.
   */
  @IsOptional()
  @IsUUID()
  frameworkId?: string
}
