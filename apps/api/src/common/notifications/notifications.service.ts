import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service.js'
import { MailerService } from '../../auth/mailer.service.js'

export interface NotifyInput {
  /** Who to tell. */
  userId: string
  /** Who caused it — never notified about their own action. */
  actorUserId?: string | null
  subject: string
  body: string
  /** In-app path the message points at, e.g. '/tasks?task=…'. */
  link?: string | null
  senderLabel?: string
  /** Set false for chatter that belongs in the inbox but not in a mailbox. */
  email?: boolean
}

/**
 * "Given a userId, tell that person." Until now nothing in the product could do
 * that: assignment was recorded in the audit log and nowhere else, so a colleague
 * made owner of an initiative found out by noticing. The two systems that DO
 * notify (alerts, report schedules) address raw email strings and know nothing
 * about accounts.
 *
 * Dual channel by design — the in-app inbox is the durable record (it survives a
 * missed email and carries the link), the email is the nudge. Shaped like
 * {@link AuditService}: fire-and-forget, and a notification failure must never
 * fail the assignment that caused it. Every path here either succeeds or logs.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    try {
      if (!input.userId) return
      // Nobody needs telling what they just did themselves. This is the single
      // most common case — an owner assigning work to themselves — and a
      // notification for it trains people to ignore the inbox.
      if (input.actorUserId && input.actorUserId === input.userId) return

      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true },
      })
      if (!user) return

      // The record first: if the mail server is down the person still finds it.
      await this.prisma.message.create({
        data: {
          userId: user.id,
          subject: input.subject,
          body: input.body,
          link: input.link ?? null,
          senderLabel: input.senderLabel ?? 'KYRO',
        },
      })

      if (input.email === false) return
      try {
        await this.mailer.sendAlert(user.email, input.subject, input.body)
      } catch (err) {
        // Per-recipient fail-soft, the same posture the report scheduler uses.
        this.logger.warn(`Notification email failed for ${user.id}: ${String(err)}`)
      }
    } catch (err) {
      this.logger.warn(`Failed to notify ${input.userId}: ${String(err)}`)
    }
  }

  /**
   * "You've been assigned X" — composed ONCE so nine call sites across four
   * modules cannot drift into nine dialects, and so each of them is a single
   * line sitting beside its existing audit.write. `what` names the kind of thing
   * ("task", "initiative", "goal"); `title` is the record's own name.
   *
   * Resolves the school and actor names itself: no caller should have to run two
   * extra queries to send a notification, and a caller that skipped them would
   * quietly send a worse message.
   */
  async notifyAssignment(opts: {
    userId: string | null | undefined
    actorUserId?: string | null
    schoolId?: string | null
    what: string
    title: string
    link?: string | null
    dueDate?: Date | string | null
    note?: string | null
  }): Promise<void> {
    try {
      if (!opts.userId) return
      if (opts.actorUserId && opts.actorUserId === opts.userId) return

      const [school, actor] = await Promise.all([
        opts.schoolId
          ? this.prisma.school.findUnique({
              where: { id: opts.schoolId },
              select: { name: true },
            })
          : Promise.resolve(null),
        opts.actorUserId
          ? this.prisma.user.findUnique({
              where: { id: opts.actorUserId },
              select: { firstName: true, lastName: true, email: true },
            })
          : Promise.resolve(null),
      ])

      const actorName = actor
        ? [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim() || actor.email
        : null
      const at = school?.name ? ` at ${school.name}` : ''
      const lines = [
        actorName
          ? `${actorName} assigned you the ${opts.what} "${opts.title}"${at}.`
          : `You have been assigned the ${opts.what} "${opts.title}"${at}.`,
      ]
      if (opts.dueDate) {
        const d =
          typeof opts.dueDate === 'string' ? opts.dueDate : opts.dueDate.toISOString()
        lines.push(`Due ${d.slice(0, 10)}.`)
      }
      if (opts.note) lines.push(opts.note)

      await this.notify({
        userId: opts.userId,
        actorUserId: opts.actorUserId ?? null,
        subject: `You've been assigned: ${opts.title}`,
        body: lines.join('\n\n'),
        link: opts.link ?? null,
      })
    } catch (err) {
      this.logger.warn(`Failed to compose assignment notice: ${String(err)}`)
    }
  }
}
