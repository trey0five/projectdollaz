import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import type { User } from '@finrep/db'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RolesGuard } from '../common/guards/roles.guard.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { EntitlementGuard } from '../billing/entitlement.guard.js'
import { TasksService } from './tasks.service.js'
import { CreateTaskDto } from './dto/create-task.dto.js'
import { UpdateTaskDto } from './dto/update-task.dto.js'
import { ListTasksQueryDto } from './dto/list-tasks-query.dto.js'
import { SubmitTaskApprovalDto } from './dto/submit-task-approval.dto.js'
import { DecideTaskDto } from './dto/decide-task.dto.js'

/**
 * Phase 3 Workflow v1 — the generic TASK controller. Workflow is CORE (roadmap:
 * "always included … cannot be unbundled"), so — CRITICALLY — there is NO
 * @RequiresModule decorator (contrast PoliciesController's @RequiresModule
 * ('governance')). With no @RequiresModule metadata the shared EntitlementGuard
 * runs the LEGACY BINARY path: the school must be ENTITLED (active OR trialing) →
 * else 402 SUBSCRIPTION_REQUIRED, but NO specific module is required. This is
 * byte-identical to the ~30 pre-existing core controllers. A trial school and an
 * entitled finance-only school BOTH get tasks; only a lapsed school is blocked.
 *
 * Guard ORDER matches the rest of the app: JwtAuthGuard (401) → RolesGuard (403) →
 * EntitlementGuard (402). All roles may READ; owner/accountant may WRITE. Tenant
 * isolation lives in the service (every query filtered by schoolId). ParseUUIDPipe
 * → bad UUID 400.
 */
@Controller('schools/:schoolId/tasks')
@UseGuards(JwtAuthGuard, RolesGuard, EntitlementGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @Roles('owner', 'accountant', 'viewer')
  list(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query() filters: ListTasksQueryDto,
  ) {
    return this.tasks.list(schoolId, filters)
  }

  @Post()
  @Roles('owner', 'accountant')
  create(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: User,
  ) {
    return this.tasks.create(schoolId, dto, user.id)
  }

  @Patch(':taskId')
  @Roles('owner', 'accountant')
  update(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: User,
  ) {
    return this.tasks.update(schoolId, taskId, dto, user.id)
  }

  @Post(':taskId/complete')
  @Roles('owner', 'accountant')
  complete(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: User,
  ) {
    return this.tasks.complete(schoolId, taskId, user.id)
  }

  /**
   * Route a task to an approver for sign-off. owner/accountant only — a viewer
   * cannot ASSIGN an approver (that is an operator action); they can only DECIDE
   * when named. The service validates the approver is an active member (400 else).
   */
  @Post(':taskId/submit-approval')
  @Roles('owner', 'accountant')
  submitApproval(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: SubmitTaskApprovalDto,
    @CurrentUser() user: User,
  ) {
    // Resolve the ordered chain: the new array wins; else the legacy single field
    // (a 1-step chain); the service 400s an empty list.
    const approvers = dto.approverUserIds ?? (dto.approverUserId ? [dto.approverUserId] : [])
    return this.tasks.submitForApproval(schoolId, taskId, approvers, user.id)
  }

  /**
   * Record the approver's decision. @Roles INCLUDES 'viewer' deliberately — a
   * board-chair approver is frequently a viewer and must be able to sign off. The
   * ROUTE ROLE IS NOT THE GATE: the service enforces caller.id === task.approverUserId
   * (403 else), so a non-approver owner/accountant CANNOT decide, and a viewer can
   * ONLY decide the tasks they were named the approver of.
   */
  @Post(':taskId/decide')
  @Roles('owner', 'accountant', 'viewer')
  decide(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: DecideTaskDto,
    @CurrentUser() user: User,
  ) {
    return this.tasks.decide(schoolId, taskId, dto.decision, dto.note ?? null, user)
  }

  @Delete(':taskId')
  @Roles('owner', 'accountant')
  remove(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: User,
  ) {
    return this.tasks.remove(schoolId, taskId, user.id)
  }
}
