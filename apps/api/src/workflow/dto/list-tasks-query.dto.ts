import { IsIn, IsOptional, IsUUID } from 'class-validator'
import { TASK_STATUSES, type TaskStatus } from './create-task.dto.js'

/**
 * List filters. Also validated by the global forbidNonWhitelisted pipe, so a
 * stray query key 400s. v1 has no free-text search. status is one of the four
 * literals (the FE "open" convenience is derived client-side / the briefing uses
 * a dedicated open read, not this query).
 */
export class ListTasksQueryDto {
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string
}
