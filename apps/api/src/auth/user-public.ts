import type { User } from '@finrep/db'

export interface UserPublic {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  email_verified: boolean
  mfa_enabled: boolean
  created_at: string
}

/** Strips PBKDF2 material + all token/code/TOTP columns from a User. */
export function toUserPublic(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    first_name: user.firstName ?? null,
    last_name: user.lastName ?? null,
    email_verified: user.emailVerified,
    // Boolean status ONLY — never any TOTP secret/backup-code material.
    mfa_enabled: user.totpEnabled,
    created_at: user.createdAt.toISOString(),
  }
}
