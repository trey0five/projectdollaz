// Phase 2 — low-level Blackbaud SKY API OAuth 2.0 + School-roster client. No SDK:
// plain fetch against Blackbaud's documented endpoints. Stateless (the service
// persists tokens), mirroring QboClient exactly: buildAuthorizeUrl(state=schoolId),
// exchangeCode, refresh (rotating tokens), and getStudents(). Blackbaud is the ONE
// live-verifiable SIS (open dev sandbox: OAuth2 + a Bb-Api-Subscription-Key header);
// config-gated via isConfigured() so the Connect button is dark until keys are set.
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnrollmentSource } from '@finrep/db'
import type { RawStudentRow } from './enrollment.normalize.js'

const AUTHORIZE_URL = 'https://app.blackbaud.com/oauth/authorize'
const TOKEN_URL = 'https://oauth2.sky.blackbaud.com/token'
const API_BASE = 'https://api.sky.blackbaud.com'

export interface EnrollmentTokens {
  accessToken: string
  refreshToken: string
  expiresInSec: number
}

/** One raw Blackbaud School "user" row (only the fields the roster mapper reads). */
interface BbUser {
  id?: number | string
  // Grade level can surface under several shapes across SKY list endpoints; the
  // mapper below reads them defensively (we normalize the label downstream).
  grade_level?: string
  student_info?: { grade_level?: string; grade?: string }
  grade?: string
  // Enrollment status (active/inactive) when the list includes it.
  status?: string
}

@Injectable()
export class EnrollmentClient {
  constructor(private readonly config: ConfigService) {}

  /** True when this server carries the Blackbaud SKY OAuth app credentials. */
  isConfigured(): boolean {
    return (this.config.get<string>('enrollment.blackbaud.clientId') ?? '').length > 0
  }

  /** The Blackbaud consent URL the school is redirected to. `state` carries the schoolId. */
  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('enrollment.blackbaud.clientId') ?? '',
      response_type: 'code',
      redirect_uri: this.config.get<string>('enrollment.blackbaud.redirectUri') ?? '',
      state,
    })
    return `${AUTHORIZE_URL}?${params.toString()}`
  }

  private authHeader(): string {
    const id = this.config.get<string>('enrollment.blackbaud.clientId') ?? ''
    const secret = this.config.get<string>('enrollment.blackbaud.clientSecret') ?? ''
    return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
  }

  private async tokenRequest(body: URLSearchParams): Promise<EnrollmentTokens> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: this.authHeader(),
      },
      body,
    })
    if (!res.ok) {
      throw new Error(`Blackbaud token exchange failed (${res.status})`)
    }
    const data = (await res.json()) as {
      access_token: string
      refresh_token: string
      expires_in: number
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresInSec: data.expires_in,
    }
  }

  /** Exchange the OAuth authorization code for tokens. */
  exchangeCode(code: string): Promise<EnrollmentTokens> {
    return this.tokenRequest(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.get<string>('enrollment.blackbaud.redirectUri') ?? '',
      }),
    )
  }

  /** Refresh an access token (Blackbaud rotates the refresh token — persist the new one). */
  refresh(refreshToken: string): Promise<EnrollmentTokens> {
    return this.tokenRequest(
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    )
  }

  /** The subscription key: the school's own, else the server default (sandbox). */
  private subscriptionKey(source: EnrollmentSource): string {
    return source.subscriptionKey ?? this.config.get<string>('enrollment.blackbaud.subscriptionKey') ?? ''
  }

  /**
   * Pull the current student roster and reduce it to normalizer rows. Uses the SKY
   * School "users" list filtered to the student base-role (configurable role id).
   * The caller supplies an already-valid access token (the service refreshes +
   * persists). Grade level is read defensively from the shapes SKY list endpoints
   * expose; the pure normalizer maps the label → GradeKey.
   */
  async getStudents(source: EnrollmentSource, accessToken: string): Promise<RawStudentRow[]> {
    const roleId =
      source.externalOrgId /* reused as the student base-role id when set */ ??
      this.config.get<string>('enrollment.blackbaud.studentRoleId') ??
      ''
    const path = roleId ? `/school/v1/users?roles=${encodeURIComponent(roleId)}` : '/school/v1/users'
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Bb-Api-Subscription-Key': this.subscriptionKey(source),
      },
    })
    if (!res.ok) {
      throw new Error(`Blackbaud roster request failed (${res.status})`)
    }
    const data = (await res.json()) as { value?: BbUser[] }
    return (data.value ?? []).map((u) => ({
      grade: u.grade_level ?? u.student_info?.grade_level ?? u.student_info?.grade ?? u.grade ?? null,
      status: u.status ?? null,
    }))
  }
}
