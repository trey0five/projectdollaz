// Phase 6 — low-level QuickBooks Online OAuth 2.0 + Reports API client. No SDK
// dependency: plain fetch against Intuit's documented endpoints. Stateless; the
// caller persists tokens. Endpoints/data shapes per Intuit's QBO API docs — the
// connector is config-gated, so live verification needs a sandbox app + company.
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2'
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const SCOPE = 'com.intuit.quickbooks.accounting'
const MINOR_VERSION = '70'

export interface QboTokens {
  accessToken: string
  refreshToken: string
  expiresInSec: number
}

/** A normalized trial-balance row ready for @finrep engine intake. */
export interface QboTrialBalanceRow {
  acct: number
  desc: string
  total: number // debit positive, credit negative
}

@Injectable()
export class QboClient {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return (this.config.get<string>('quickbooks.clientId') ?? '').length > 0
  }

  private apiBase(): string {
    return this.config.get<string>('quickbooks.environment') === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com'
  }

  /** The Intuit consent URL the school is redirected to. `state` carries the schoolId. */
  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('quickbooks.clientId') ?? '',
      response_type: 'code',
      scope: SCOPE,
      redirect_uri: this.config.get<string>('quickbooks.redirectUri') ?? '',
      state,
    })
    return `${AUTHORIZE_URL}?${params.toString()}`
  }

  private authHeader(): string {
    const id = this.config.get<string>('quickbooks.clientId') ?? ''
    const secret = this.config.get<string>('quickbooks.clientSecret') ?? ''
    return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
  }

  private async tokenRequest(body: URLSearchParams): Promise<QboTokens> {
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
      throw new Error(`QBO token exchange failed (${res.status})`)
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
  exchangeCode(code: string): Promise<QboTokens> {
    return this.tokenRequest(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.get<string>('quickbooks.redirectUri') ?? '',
      }),
    )
  }

  /** Refresh an access token (refresh tokens rotate — persist the returned one). */
  refresh(refreshToken: string): Promise<QboTokens> {
    return this.tokenRequest(
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    )
  }

  private async apiGet(realmId: string, accessToken: string, path: string): Promise<unknown> {
    const sep = path.includes('?') ? '&' : '?'
    const res = await fetch(`${this.apiBase()}/v3/company/${realmId}/${path}${sep}minorversion=${MINOR_VERSION}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      throw new Error(`QBO API ${path} failed (${res.status})`)
    }
    return res.json()
  }

  /**
   * Pull the Trial Balance as of `endDate` and map to engine rows. Account numbers
   * come from the Account list (the TB report carries names, not AcctNum); rows
   * without an account number fall back to a high synthetic code so they surface
   * as unmapped rather than being dropped.
   */
  async getTrialBalance(
    realmId: string,
    accessToken: string,
    endDate: string,
  ): Promise<QboTrialBalanceRow[]> {
    const acctNumByName = await this.accountNumbersByName(realmId, accessToken)
    const report = (await this.apiGet(
      realmId,
      accessToken,
      `reports/TrialBalance?accounting_method=Accrual&end_date=${encodeURIComponent(endDate)}`,
    )) as { Rows?: { Row?: Array<{ ColData?: Array<{ value?: string }> }> } }

    const rows: QboTrialBalanceRow[] = []
    let synthetic = 90000
    for (const r of report?.Rows?.Row ?? []) {
      const cols = r.ColData ?? []
      const name = (cols[0]?.value ?? '').trim()
      if (!name) continue
      const debit = Number(cols[1]?.value ?? 0) || 0
      const credit = Number(cols[2]?.value ?? 0) || 0
      const acctNum = acctNumByName.get(name.toLowerCase())
      const acct = acctNum != null ? acctNum : synthetic++
      rows.push({ acct, desc: name, total: debit - credit })
    }
    return rows
  }

  private async accountNumbersByName(
    realmId: string,
    accessToken: string,
  ): Promise<Map<string, number>> {
    const data = (await this.apiGet(
      realmId,
      accessToken,
      'query?query=' + encodeURIComponent('select Id, Name, AcctNum from Account maxresults 1000'),
    )) as { QueryResponse?: { Account?: Array<{ Name?: string; AcctNum?: string }> } }
    const map = new Map<string, number>()
    for (const a of data?.QueryResponse?.Account ?? []) {
      const num = Number(a.AcctNum)
      if (a.Name && Number.isFinite(num)) map.set(a.Name.toLowerCase(), num)
    }
    return map
  }
}
