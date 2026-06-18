import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

/**
 * Injects the current session id (the `sid` claim = the paired refresh token's
 * jti) from the verified access token. Used by change-password to revoke every
 * OTHER session while keeping the caller's current one alive. Returns undefined
 * for legacy tokens minted before `sid` existed.
 */
export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>()
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) return undefined
    const token = header.slice('Bearer '.length).trim()
    const part = token.split('.')[1]
    if (!part) return undefined
    try {
      const json = Buffer.from(
        part.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8')
      const payload = JSON.parse(json) as { sid?: string }
      return typeof payload.sid === 'string' ? payload.sid : undefined
    } catch {
      return undefined
    }
  },
)
