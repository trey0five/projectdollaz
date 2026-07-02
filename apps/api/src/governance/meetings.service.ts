import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Meeting } from '@finrep/db'
import {
  computeMeetingSignal,
  summarizeMeetings,
  type MeetingsSummary,
  type MeetingSignalInput,
} from '@finrep/compliance'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from '../common/audit/audit.service.js'
import type { CreateMeetingDto, MeetingStatus, MinutesStatus } from './dto/create-meeting.dto.js'
import { MEETING_STATUSES, MINUTES_STATUSES } from './dto/create-meeting.dto.js'
import type { UpdateMeetingDto } from './dto/update-meeting.dto.js'

/** A meeting row joined with the committee name (for the public label). */
type MeetingRow = Meeting & { committee?: { name: string } | null }

/** One meeting as returned to the client, with the COMPUTED signal flattened. */
export interface MeetingPublic {
  id: string
  committeeId: string | null
  committeeName: string | null
  title: string
  scheduledAt: string | null
  location: string | null
  status: MeetingStatus
  agenda: string | null
  minutes: string | null
  decisions: string | null
  minutesStatus: MinutesStatus
  minutesApprovedAt: string | null
  /** COMPUTED (never stored) — from @finrep/compliance computeMeetingSignal. */
  isUpcoming: boolean
  daysUntilMeeting: number | null
  agendaMissing: boolean
  minutesPending: boolean
  minutesOverdue: boolean
  createdAt: string
  updatedAt: string
}

export interface MeetingListResponse {
  meetings: MeetingPublic[]
  summary: MeetingsSummary
}

/** Deterministic list order: upcoming (soonest first) → others (most recent first). */
function meetingSort(a: MeetingPublic, b: MeetingPublic): number {
  if (a.isUpcoming !== b.isUpcoming) return a.isUpcoming ? -1 : 1
  const av = a.scheduledAt ?? ''
  const bv = b.scheduledAt ?? ''
  // Upcoming: soonest date first (asc). Past/other: most recent first (desc).
  const cmp = a.isUpcoming ? av.localeCompare(bv) : bv.localeCompare(av)
  return cmp !== 0 ? cmp : a.id.localeCompare(b.id)
}

/** Serialize a DB Date (@db.Date) to yyyy-mm-dd, UTC-only (no tz drift). */
function toIsoDate(d: Date | null): string | null {
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

/** Parse an incoming ISO date string to a UTC-midnight Date, or throw. Null passes. */
function parseIsoDate(s: string | null | undefined, field: string): Date | null | undefined {
  if (s === undefined) return undefined
  if (s === null) return null
  const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid ${field}: ${s}.`)
  return d
}

function normalizeStatus(s: string | null | undefined): MeetingStatus {
  return (MEETING_STATUSES as readonly string[]).includes(s ?? '')
    ? (s as MeetingStatus)
    : 'scheduled'
}

function normalizeMinutesStatus(s: string | null | undefined): MinutesStatus {
  return (MINUTES_STATUSES as readonly string[]).includes(s ?? '')
    ? (s as MinutesStatus)
    : 'none'
}

/**
 * Phase 3 Governance depth — the MEETING register service. School-scoped, mirrors
 * PoliciesService: TENANT ISOLATION on EVERY query (reads filter by schoolId,
 * update/delete first resolve `where { id, schoolId }` → 404 for a foreign id).
 *
 * A meeting's committeeId is a client-controlled FK — create/update ALWAYS
 * validate it is SAME-SCHOOL via assertCommitteeSameSchool (a forged/foreign id →
 * 404), never trusting the client value.
 *
 * Every response is enriched with the pure computeMeetingSignal (injectable now),
 * so the register list and the briefing 'governance' STEP share one source of
 * truth. minutesApprovedAt / minutesApprovedByUserId are SERVER-OWNED (stamped on
 * the minutesStatus→'approved' transition), never client-writable.
 */
@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Map a DB row → public shape, attaching the computed signal. */
  private toPublic(row: MeetingRow, now = new Date()): MeetingPublic {
    const scheduledAt = toIsoDate(row.scheduledAt)
    const signal = computeMeetingSignal(
      {
        status: row.status,
        scheduledAt,
        agenda: row.agenda,
        minutesStatus: row.minutesStatus,
      },
      now,
    )
    return {
      id: row.id,
      committeeId: row.committeeId,
      committeeName: row.committee?.name ?? null,
      title: row.title,
      scheduledAt,
      location: row.location,
      status: normalizeStatus(row.status),
      agenda: row.agenda,
      minutes: row.minutes,
      decisions: row.decisions,
      minutesStatus: normalizeMinutesStatus(row.minutesStatus),
      minutesApprovedAt: toIsoDate(row.minutesApprovedAt),
      isUpcoming: signal.isUpcoming,
      daysUntilMeeting: signal.daysUntilMeeting,
      agendaMissing: signal.agendaMissing,
      minutesPending: signal.minutesPending,
      minutesOverdue: signal.minutesOverdue,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /**
   * A meeting's committeeId is a client-controlled FK. When present (non-null) it
   * MUST resolve to a committee in the SAME school, else 404 — NEVER trust a
   * cross-tenant/forged committeeId. Null/undefined skips (no committee).
   */
  private async assertCommitteeSameSchool(
    schoolId: string,
    committeeId: string | null | undefined,
  ): Promise<void> {
    if (committeeId === null || committeeId === undefined) return
    const committee = await this.prisma.committee.findFirst({
      where: { id: committeeId, schoolId },
    })
    if (!committee) throw new NotFoundException('Committee not found.')
  }

  /** List all meetings for one school, deterministically ordered + enriched. */
  async listMeetings(schoolId: string, now = new Date()): Promise<MeetingListResponse> {
    const rows = (await this.prisma.meeting.findMany({
      where: { schoolId },
      include: { committee: { select: { name: true } } },
    })) as MeetingRow[]
    const meetings = rows.map((r) => this.toPublic(r, now)).sort(meetingSort)
    const summary = summarizeMeetings(
      rows.map(
        (r): MeetingSignalInput => ({
          status: r.status,
          scheduledAt: toIsoDate(r.scheduledAt),
          agenda: r.agenda,
          minutesStatus: r.minutesStatus,
        }),
      ),
      now,
    )
    return { meetings, summary }
  }

  async create(
    schoolId: string,
    dto: CreateMeetingDto,
    userId: string,
    now = new Date(),
  ): Promise<MeetingPublic> {
    await this.assertCommitteeSameSchool(schoolId, dto.committeeId ?? null)
    const scheduledAt = parseIsoDate(dto.scheduledAt, 'scheduledAt')
    if (!scheduledAt) throw new BadRequestException('scheduledAt is required.')

    const minutesStatus = normalizeMinutesStatus(dto.minutesStatus)
    // A meeting created already-approved stamps the approver/date up front.
    const approved = minutesStatus === 'approved'

    const row = await this.prisma.meeting.create({
      data: {
        schoolId,
        committeeId: dto.committeeId ?? null,
        title: dto.title,
        scheduledAt,
        location: dto.location ?? null,
        status: normalizeStatus(dto.status),
        agenda: dto.agenda ?? null,
        minutes: dto.minutes ?? null,
        decisions: dto.decisions ?? null,
        minutesStatus,
        minutesApprovedAt: approved ? this.today(now) : null,
        minutesApprovedByUserId: approved ? userId : null,
        updatedByUserId: userId,
      },
      include: { committee: { select: { name: true } } },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'governance.meeting.created',
      targetType: 'governance_meetings',
      targetId: row.id,
    })
    return this.toPublic(row as MeetingRow, now)
  }

  async update(
    schoolId: string,
    meetingId: string,
    dto: UpdateMeetingDto,
    userId: string,
    now = new Date(),
  ): Promise<MeetingPublic> {
    // Tenant-safe ownership check: a foreign/unknown id is a 404, never a mutation.
    const existing = await this.prisma.meeting.findFirst({
      where: { id: meetingId, schoolId },
    })
    if (!existing) throw new NotFoundException('Meeting not found.')

    // Validate a re-parented committeeId (only when a non-null string is provided).
    if (dto.committeeId !== undefined && dto.committeeId !== null) {
      await this.assertCommitteeSameSchool(schoolId, dto.committeeId)
    }

    const pick = <T>(v: T | undefined, current: T): T => (v === undefined ? current : v)
    // scheduledAt is a non-nullable column; the update DTO is string|undefined
    // (never null), so parseIsoDate yields Date|undefined — undefined = keep.
    const parsedScheduledAt = parseIsoDate(dto.scheduledAt, 'scheduledAt')
    const scheduledAt: Date | undefined =
      parsedScheduledAt === null ? undefined : parsedScheduledAt
    const nextMinutesStatus = pick(
      dto.minutesStatus ? normalizeMinutesStatus(dto.minutesStatus) : undefined,
      existing.minutesStatus,
    )

    // Minutes-approval transition (SERVER-OWNED fields):
    //   → 'approved'      stamp approver + today (once, on the flip TO approved)
    //   away from 'approved' clear both (approval revoked)
    let minutesApprovedAt = existing.minutesApprovedAt
    let minutesApprovedByUserId = existing.minutesApprovedByUserId
    if (nextMinutesStatus === 'approved' && existing.minutesStatus !== 'approved') {
      minutesApprovedAt = this.today(now)
      minutesApprovedByUserId = userId
    } else if (nextMinutesStatus !== 'approved' && existing.minutesStatus === 'approved') {
      minutesApprovedAt = null
      minutesApprovedByUserId = null
    }

    const row = await this.prisma.meeting.update({
      where: { id: existing.id },
      data: {
        committeeId: pick(dto.committeeId, existing.committeeId),
        title: pick(dto.title, existing.title),
        scheduledAt: pick(scheduledAt, existing.scheduledAt),
        location: pick(dto.location, existing.location),
        status: pick(dto.status ? normalizeStatus(dto.status) : undefined, existing.status),
        agenda: pick(dto.agenda, existing.agenda),
        minutes: pick(dto.minutes, existing.minutes),
        decisions: pick(dto.decisions, existing.decisions),
        minutesStatus: nextMinutesStatus,
        minutesApprovedAt,
        minutesApprovedByUserId,
        updatedByUserId: userId,
      },
      include: { committee: { select: { name: true } } },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'governance.meeting.updated',
      targetType: 'governance_meetings',
      targetId: row.id,
    })
    return this.toPublic(row as MeetingRow, now)
  }

  /**
   * Mark a meeting's minutes approved — the dedicated action behind the FE button.
   * SERVER-OWNED: stamps minutesStatus='approved', minutesApprovedAt=today (UTC),
   * minutesApprovedByUserId=userId. Tenant-safe (404 for a foreign id).
   */
  async approveMinutes(
    schoolId: string,
    meetingId: string,
    userId: string,
    now = new Date(),
  ): Promise<MeetingPublic> {
    const existing = await this.prisma.meeting.findFirst({
      where: { id: meetingId, schoolId },
    })
    if (!existing) throw new NotFoundException('Meeting not found.')
    const row = await this.prisma.meeting.update({
      where: { id: existing.id },
      data: {
        minutesStatus: 'approved',
        minutesApprovedAt: this.today(now),
        minutesApprovedByUserId: userId,
        updatedByUserId: userId,
      },
      include: { committee: { select: { name: true } } },
    })
    await this.audit.write({
      schoolId,
      userId,
      action: 'governance.meeting.minutes_approved',
      targetType: 'governance_meetings',
      targetId: row.id,
    })
    return this.toPublic(row as MeetingRow, now)
  }

  async remove(schoolId: string, meetingId: string, userId: string): Promise<{ id: string }> {
    const existing = await this.prisma.meeting.findFirst({
      where: { id: meetingId, schoolId },
    })
    if (!existing) throw new NotFoundException('Meeting not found.')
    await this.prisma.meeting.delete({ where: { id: existing.id } })
    await this.audit.write({
      schoolId,
      userId,
      action: 'governance.meeting.deleted',
      targetType: 'governance_meetings',
      targetId: existing.id,
    })
    return { id: existing.id }
  }

  /** now → a @db.Date-safe UTC-midnight Date (matches parseIsoDate discipline). */
  private today(now: Date): Date {
    const iso = now.toISOString().slice(0, 10)
    return new Date(`${iso}T00:00:00.000Z`)
  }
}
