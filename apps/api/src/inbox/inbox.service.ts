import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

interface InboxMessage {
  id: string
  subject: string
  body: string
  senderLabel: string
  readAt: string | null
  createdAt: string
}

const INBOX_TAKE = 100

/**
 * Per-user inbox. EVERY query is filtered by `userId` so a user can only ever
 * read/mark their OWN messages — a foreign id updates 0 rows (→ 404), never
 * another user's row. Explicit selects keep secret columns out of the payload.
 */
@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<{ messages: InboxMessage[]; unreadCount: number }> {
    const [rows, unreadCount] = await Promise.all([
      this.prisma.message.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: INBOX_TAKE,
        select: {
          id: true,
          subject: true,
          body: true,
          senderLabel: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.message.count({ where: { userId, readAt: null } }),
    ])
    const messages = rows.map((m) => ({
      id: m.id,
      subject: m.subject,
      body: m.body,
      senderLabel: m.senderLabel,
      readAt: m.readAt ? m.readAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
    }))
    return { messages, unreadCount }
  }

  async unreadCount(userId: string): Promise<{ unreadCount: number }> {
    const unreadCount = await this.prisma.message.count({ where: { userId, readAt: null } })
    return { unreadCount }
  }

  /** Mark ONE message read — ownership-scoped. Idempotent; 404 if not the caller's. */
  async markRead(userId: string, id: string): Promise<{ ok: true; id: string }> {
    const res = await this.prisma.message.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    })
    if (res.count === 0) {
      // Either already-read (owned) or not the caller's message at all.
      const owned = await this.prisma.message.count({ where: { id, userId } })
      if (owned === 0) throw new NotFoundException('Message not found.')
    }
    return { ok: true, id }
  }

  async markAllRead(userId: string): Promise<{ ok: true; updated: number }> {
    const res = await this.prisma.message.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })
    return { ok: true, updated: res.count }
  }
}
