import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { BillingModule } from '../billing/billing.module.js'
import { AcademicsController } from './academics.controller.js'
import { AcademicsOrgController } from './academics-org.controller.js'
import { AssessmentsService } from './assessments.service.js'
import { GradebookService } from './gradebook.service.js'
import { LessonPlansService } from './lesson-plans.service.js'
import { NameMatchService } from '../enrollment/diocesan/name-match.service.js'

/**
 * Academics — assessments, gradebook, lesson plans.
 *
 * AuthModule + BillingModule are imported because the guards resolve in THIS
 * module's injector: JwtAuthGuard needs TokenService (AuthModule) and
 * EntitlementGuard needs BillingService. PrismaService is global.
 *
 * Every service here is stateless and takes plain constructor injection — the
 * lazy-ModuleRef dance the QBO services need does not apply, because nothing in
 * this module holds a connection or a cache.
 */
@Module({
  imports: [AuthModule, BillingModule],
  controllers: [AcademicsController, AcademicsOrgController],
  // NameMatchService is a stateless resolver over PrismaService — provided
  // directly rather than importing EnrollmentModule, which would pull the roster
  // writer (deliberately unexported, one-writer rule) into this graph.
  providers: [AssessmentsService, GradebookService, LessonPlansService, NameMatchService],
  // GradebookService is exported so the ASSISTANT can call its floored summary
  // rather than running a second, un-floored copy of the same query — the
  // one-door rule the score path already follows.
  exports: [AssessmentsService, LessonPlansService, GradebookService],
})
export class AcademicsModule {}
