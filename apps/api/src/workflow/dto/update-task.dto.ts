import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator'
import {
  TASK_PRIORITIES,
  TASK_SOURCE_TYPES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskSourceType,
  type TaskStatus,
} from './create-task.dto.js'

/**
 * Patch a task. ALL fields optional (partial PATCH). Hand-written (not
 * PartialType) so the forbidNonWhitelisted whitelist stays explicit and the
 * merge-pick semantics are obvious: an OMITTED key keeps the current value; an
 * explicit `null` on a nullable field CLEARS it (description/assigneeUserId/
 * dueDate/sourceType/sourceRef). title cannot be cleared (non-nullable column),
 * so it carries @IsString/@MinLength when present.
 */
export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string

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
