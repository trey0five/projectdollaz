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
