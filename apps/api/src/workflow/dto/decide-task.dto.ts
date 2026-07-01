import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { TASK_DECISIONS, type TaskDecision } from './create-task.dto.js'

/**
 * Record an approver's decision on a PENDING task. forbidNonWhitelisted-SAFE:
 * every field is decorated. `decision` is a closed enum (approve|reject); anything
 * else 400s at the pipe before the service runs. `note` is an optional recorded
 * rationale (bounded to 2000 chars). The DECIDER identity and decidedAt are NEVER
 * client-supplied — they are set server-side (from @CurrentUser + the service `now`)
 * so a client can never forge who decided or when.
 */
export class DecideTaskDto {
  @IsIn(TASK_DECISIONS)
  decision!: TaskDecision

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null
}
