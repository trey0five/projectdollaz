import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Task, User } from '@finrep/db'
import { computeTaskUrgency, type TaskUrgency } from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import {
  APPROVAL_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type ApprovalStatus,
  type CreateTaskDto,
  type TaskDecision,
  type TaskPriority,
  type TaskStatus,
} from './dto/create-task.dto.js'
import type { UpdateTaskDto } from './dto/update-task.dto.js'
import type { ListTasksQueryDto } from './dto/list-tasks-query.dto.js'

/** Small member display (never leaks more of the User than name/email). Reused for
 *  assignee, approver, AND decidedBy so all three project the SAME safe shape. */
export interface TaskMemberRef {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
}

/** Back-compat alias — the assignee display was originally named TaskAssignee. */
export type TaskAssignee = TaskMemberRef

/** One task as returned to the client, with the COMPUTED urgency + assignee. */
export interface TaskPublic {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assigneeUserId: string | null
  assignee: TaskMemberRef | null
  dueDate: string | null
  sourceType: string | null
  sourceRef: string | null
  createdByUserId: string | null
  completedAt: string | null
  // ── Phase 3 v1 approval / sign-off ──────────────────────────────────────────
  approverUserId: string | null
  /** The designated approver's display (same safe projection as assignee). */
  approver: TaskMemberRef | null
  approvalStatus: ApprovalStatus
  decidedByUserId: string | null
  /** Who recorded the decision (approver at decide time). */
  decidedBy: TaskMemberRef | null
  decidedAt: string | null
  decisionNote: string | null
  /** COMPUTED (never stored) — from @finrep/compliance computeTaskUrgency. */
  urgency: TaskUrgency
  daysUntilDue: number | null
  createdAt: string
  updatedAt: string
}

export interface TaskListResponse {
  tasks: TaskPublic[]
}

/** A DB row with the (optional) member relations eager-loaded for display. The
 *  briefing read intentionally omits the includes (undefined), so toPublic must be
 *  undefined-safe (`row.approver ?? null`) — it only needs the approvalStatus scalar. */
type TaskRow = Task & {
  assignee?: User | null
  approver?: User | null
  decidedByUser?: User | null
}

/** The include set that eager-loads all three member relations for display. Shared
 *  by every task-returning write/read path (list/create/update/complete/submit/decide)
 *  so the approver + decidedBy badges always render; the briefing read omits it. */
const TASK_INCLUDE = { assignee: true, approver: true, decidedByUser: true } as const

/** Deterministic urgency ordering for the list sort. */
const URGENCY_ORDER: Record<TaskUrgency, number> = {
  overdue: 0,
  'due-soon': 1,
  'on-track': 2,
  none: 3,
}

/** Priority sort (high first) as a secondary tiebreak. */
const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 }

/** Serialize a DB Date (@db.Date) to yyyy-mm-dd with no timezone drift. Relies on
 *  Prisma materializing @db.Date at UTC-midnight (same contract as PoliciesService). */
function toIsoDate(d: Date | null): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

/** Parse an incoming ISO date string to a UTC-midnight Date, or throw. Null passes,
 *  undefined passes through (merge-pick "keep"). Mirrors PoliciesService.parseIsoDate. */
function parseIsoDate(s: string | null | undefined, field: string): Date | null | undefined {
  if (s === undefined) return undefined
  if (s === null) return null
  const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid ${field}: ${s}.`)
  return d
}

function normalizeStatus(s: string | null | undefined): TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(s ?? '') ? (s as TaskStatus) : 'open'
}

function normalizePriority(s: string | null | undefined): TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(s ?? '') ? (s as TaskPriority) : 'normal'
}

/** Defends the READ against a stray approvalStatus value (only the service writes
 *  it, but approval_status is a free TEXT column, not a DB enum). Mirrors
 *  normalizeStatus — fallback 'none'. */
function normalizeApprovalStatus(s: string | null | undefined): ApprovalStatus {
  return (APPROVAL_STATUSES as readonly string[]).includes(s ?? '') ? (s as ApprovalStatus) : 'none'
}

/** Project a (possibly undefined/null) User relation → the safe member display. */
function toMemberRef(u: User | null | undefined) {
  return u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email } : null
}

/**
 * Phase 3 Workflow v1 — the generic TASK engine service. School-scoped (NOT
 * period-scoped). TENANT ISOLATION is enforced on EVERY query: reads filter by
 * `schoolId`, and update/complete/delete first resolve the row `where { id,
 * schoolId }` — a taskId owned by another school resolves to null →
 * NotFoundException, so a cross-tenant mutation is IMPOSSIBLE (it never even loads
 * the foreign row).
 *
 * ASSIGNEE SECURITY: assigneeUserId must be an ACTIVE membership of the PATH
 * school (validated on create AND on every update that sets it) so a task can
 * never hold a non-member or cross-tenant assignee.
 *
 * Every response is enriched with the pure computeTaskUrgency (injectable `now`),
 * so the task list and the briefing 'workflow' STEP share one source of truth and
 * can never disagree.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Map a DB row → the public shape, attaching the computed urgency + assignee. */
  private toPublic(row: TaskRow, now = new Date()): TaskPublic {
    const { urgency, daysUntilDue } = computeTaskUrgency(
      { status: row.status, dueDate: toIsoDate(row.dueDate) },
      now,
    )
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: normalizeStatus(row.status),
      priority: normalizePriority(row.priority),
      assigneeUserId: row.assigneeUserId,
      // `?? null` keeps this undefined-safe for the briefing read (no includes).
      assignee: toMemberRef(row.assignee ?? null),
      dueDate: toIsoDate(row.dueDate),
      sourceType: row.sourceType,
      sourceRef: row.sourceRef,
      createdByUserId: row.createdByUserId,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      approverUserId: row.approverUserId,
      approver: toMemberRef(row.approver ?? null),
      approvalStatus: normalizeApprovalStatus(row.approvalStatus),
      decidedByUserId: row.decidedByUserId,
      decidedBy: toMemberRef(row.decidedByUser ?? null),
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      decisionNote: row.decisionNote,
      urgency,
      daysUntilDue,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /**
   * TENANT/SECURITY — assigneeUserId must be an ACTIVE membership of the PATH
   * school. Querying by BOTH schoolId AND userId means a valid userId from another
   * tenant returns null → 400 (cross-tenant assignment IMPOSSIBLE), and an
   * inactive/invited membership is rejected. 400 (not 404) — the id is a valid
   * UUID but semantically not assignable, matching the DTO-validation family.
   */
  private async assertAssigneeIsMember(schoolId: string, assigneeUserId: string): Promise<void> {
    return this.assertUserIsMember(schoolId, assigneeUserId, 'Assignee')
  }

  /**
   * Generic active-membership guard, reused for the assignee AND the approver. Same
   * school-scoped {schoolId,userId,status:'active'} query, so a cross-tenant user
   * returns null → 400 and an inactive/invited membership is rejected. `label`
   * ('Assignee' | 'Approver') gives a clear 400 instead of the assignee-worded copy
   * bleeding into the approval flow.
   */
  private async assertUserIsMember(
    schoolId: string,
    userId: string,
    label: 'Assignee' | 'Approver',
  ): Promise<void> {
    const m = await this.prisma.membership.findFirst({
      where: { schoolId, userId, status: 'active' },
    })
    if (!m) throw new BadRequestException(`${label} must be an active member of this school.`)
  }

  /** List all tasks for one school, deterministically ordered + enriched. */
  async list(
    schoolId: string,
    filters: ListTasksQueryDto = {},
    now = new Date(),
  ): Promise<TaskListResponse> {
    const rows = await this.prisma.task.findMany({
      where: {
        schoolId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.assigneeUserId ? { assigneeUserId: filters.assigneeUserId } : {}),
      },
      include: TASK_INCLUDE,
    })
    const tasks = rows.map((r) => this.toPublic(r, now)).sort((a, b) => {
      const u = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]
      if (u !== 0) return u
      // dueDate asc, nulls last.
      if (a.dueDate !== b.dueDate) {
        if (a.dueDate === null) return 1
        if (b.dueDate === null) return -1
        return a.dueDate.localeCompare(b.dueDate)
      }
      const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (p !== 0) return p
      const c = a.createdAt.localeCompare(b.createdAt)
      return c !== 0 ? c : a.id.localeCompare(b.id)
    })
    return { tasks }
  }

  /**
   * The briefing's read: only OPEN/in-progress tasks bearing an urgency signal,
   * urgency pre-computed. Keeps the briefing decoupled from list-filter/sort
   * concerns. School-scoped; terminal tasks (done/cancelled) are excluded both by
   * the status filter AND by computeTaskUrgency returning 'none'.
   */
  async listOpenForBriefing(schoolId: string, now = new Date()): Promise<TaskPublic[]> {
    const rows = await this.prisma.task.findMany({
      where: { schoolId, status: { in: ['open', 'in_progress'] } },
    })
    return rows.map((r) => this.toPublic(r, now))
  }

  async create(schoolId: string, dto: CreateTaskDto, userId: string): Promise<TaskPublic> {
    if (dto.assigneeUserId != null) await this.assertAssigneeIsMember(schoolId, dto.assigneeUserId)
    const dueDate = parseIsoDate(dto.dueDate, 'dueDate') ?? null
    const status = normalizeStatus(dto.status)
    const row = await this.prisma.task.create({
      data: {
        schoolId,
        title: dto.title,
        description: dto.description ?? null,
        assigneeUserId: dto.assigneeUserId ?? null,
        dueDate,
        status,
        priority: normalizePriority(dto.priority),
        sourceType: dto.sourceType ?? null,
        sourceRef: dto.sourceRef ?? null,
        createdByUserId: userId,
        // A task created directly as done stamps completedAt for consistency.
        completedAt: status === 'done' ? new Date() : null,
      },
      include: TASK_INCLUDE,
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'task.created',
      targetType: 'tasks',
      targetId: row.id,
    })
    return this.toPublic(row)
  }

  async update(
    schoolId: string,
    taskId: string,
    dto: UpdateTaskDto,
    userId: string,
  ): Promise<TaskPublic> {
    // Tenant-safe ownership check: a foreign/unknown id is a 404, never a mutation.
    const existing = await this.prisma.task.findFirst({ where: { id: taskId, schoolId } })
    if (!existing) throw new NotFoundException('Task not found.')

    // Re-validate membership whenever the assignee is being SET to a non-null user.
    if (dto.assigneeUserId != null) await this.assertAssigneeIsMember(schoolId, dto.assigneeUserId)

    // Merge-pick: undefined = keep, explicit null = clear (for nullable fields).
    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    const dueDate = parseIsoDate(dto.dueDate, 'dueDate')
    const nextStatus = dto.status ? normalizeStatus(dto.status) : existing.status

    // completedAt lifecycle: stamp on transition INTO done; clear on transition OUT.
    let completedAt = existing.completedAt
    if (nextStatus === 'done' && existing.status !== 'done') completedAt = new Date()
    else if (nextStatus !== 'done' && existing.status === 'done') completedAt = null

    const row = await this.prisma.task.update({
      where: { id: existing.id },
      data: {
        title: pick(dto.title, existing.title),
        description: pick(dto.description, existing.description),
        assigneeUserId: pick(dto.assigneeUserId, existing.assigneeUserId),
        dueDate: pick(dueDate, existing.dueDate),
        status: nextStatus,
        priority: pick(dto.priority ? normalizePriority(dto.priority) : undefined, existing.priority),
        sourceType: pick(dto.sourceType, existing.sourceType),
        sourceRef: pick(dto.sourceRef, existing.sourceRef),
        completedAt,
      },
      include: TASK_INCLUDE,
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'task.updated',
      targetType: 'tasks',
      targetId: row.id,
    })
    return this.toPublic(row)
  }

  async complete(schoolId: string, taskId: string, userId: string): Promise<TaskPublic> {
    const existing = await this.prisma.task.findFirst({ where: { id: taskId, schoolId } })
    if (!existing) throw new NotFoundException('Task not found.')
    const row = await this.prisma.task.update({
      where: { id: existing.id },
      data: { status: 'done', completedAt: new Date() },
      include: TASK_INCLUDE,
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'task.completed',
      targetType: 'tasks',
      targetId: row.id,
    })
    return this.toPublic(row)
  }

  /**
   * Phase 3 v1 — route a task to a single approver for sign-off. State machine:
   *   none | rejected  ──submit──▶  pending
   * GUARDS (in order): tenant (404) → source approvalStatus must be none|rejected
   * (a pending/approved task 400s — no double-submit; a rejected task MAY be
   * resubmitted after rework) → the task must be live (not done/cancelled) → the
   * approver must be an ACTIVE member of THIS school. On success it sets the
   * approver + 'pending' and CLEARS any stale decision fields from a prior reject
   * cycle (so a resubmitted task never shows "rejected by X"). status is untouched —
   * a task keeps its open/in_progress state while awaiting sign-off (which is why
   * listOpenForBriefing still sees it).
   */
  async submitForApproval(
    schoolId: string,
    taskId: string,
    approverUserId: string,
    userId: string,
  ): Promise<TaskPublic> {
    const existing = await this.prisma.task.findFirst({ where: { id: taskId, schoolId } })
    if (!existing) throw new NotFoundException('Task not found.')

    const current = normalizeApprovalStatus(existing.approvalStatus)
    if (current !== 'none' && current !== 'rejected') {
      throw new BadRequestException('This task is already awaiting or has completed approval.')
    }
    if (existing.status === 'done' || existing.status === 'cancelled') {
      throw new BadRequestException('Cannot request approval on a completed or cancelled task.')
    }
    await this.assertUserIsMember(schoolId, approverUserId, 'Approver')

    const row = await this.prisma.task.update({
      where: { id: existing.id },
      data: {
        approverUserId,
        approvalStatus: 'pending',
        // Clear any prior decision so a resubmitted (previously rejected) task is clean.
        decidedByUserId: null,
        decidedAt: null,
        decisionNote: null,
      },
      include: TASK_INCLUDE,
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'task.approval_requested',
      targetType: 'tasks',
      targetId: row.id,
    })
    return this.toPublic(row)
  }

  /**
   * Phase 3 v1 — record the approver's decision on a PENDING task. State machine:
   *   pending ──approve──▶ approved (+ status done, completedAt stamped)
   *   pending ──reject───▶ rejected (+ status in_progress, completedAt cleared)
   *
   * GUARDS (order matters):
   *   1. tenant (404 — never loads the foreign row).
   *   2. approvalStatus MUST be 'pending' → else 400 (blocks decide-without-pending
   *      AND double-decide, since a decided task is approved/rejected, never pending).
   *   3. THE SECURITY GATE: caller MUST be the designated approver
   *      (existing.approverUserId === user.id) → else 403. The route allows a viewer
   *      so a board-chair approver can act, but NO privileged role (owner/accountant)
   *      may decide a task they were not named the approver of. The pending-guard
   *      runs BEFORE the identity-guard so a random caller poking a non-pending task
   *      gets a plain 400 and never learns the approver identity via a 403.
   * decidedAt is stamped at the SERVICE boundary (never client-supplied) so the
   * decision timestamp/decider cannot be forged.
   */
  async decide(
    schoolId: string,
    taskId: string,
    decision: TaskDecision,
    note: string | null,
    user: User,
  ): Promise<TaskPublic> {
    const existing = await this.prisma.task.findFirst({ where: { id: taskId, schoolId } })
    if (!existing) throw new NotFoundException('Task not found.')

    if (normalizeApprovalStatus(existing.approvalStatus) !== 'pending') {
      throw new BadRequestException('This task is not awaiting a decision.')
    }
    if (existing.approverUserId !== user.id) {
      throw new ForbiddenException('Only the designated approver may decide this task.')
    }

    const now = new Date()
    const decided =
      decision === 'approve'
        ? { approvalStatus: 'approved', status: 'done', completedAt: now }
        : { approvalStatus: 'rejected', status: 'in_progress', completedAt: null }

    const row = await this.prisma.task.update({
      where: { id: existing.id },
      data: {
        ...decided,
        decidedByUserId: user.id,
        decidedAt: now,
        decisionNote: note ?? null,
      },
      include: TASK_INCLUDE,
    })
    await this.audit.write({
      schoolId,
      userId: user.id,
      action: decision === 'approve' ? 'task.approved' : 'task.rejected',
      targetType: 'tasks',
      targetId: row.id,
    })
    return this.toPublic(row)
  }

  async remove(schoolId: string, taskId: string, userId: string): Promise<{ id: string }> {
    const existing = await this.prisma.task.findFirst({ where: { id: taskId, schoolId } })
    if (!existing) throw new NotFoundException('Task not found.')
    await this.prisma.task.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'task.deleted',
      targetType: 'tasks',
      targetId: existing.id,
    })
    return { id: existing.id }
  }
}
