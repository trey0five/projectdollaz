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

/** A pulled trial balance + the school-mapping entries its P&L rows need. */
export interface QboTrialBalance {
  rows: QboTrialBalanceRow[]
  /** acct → SCoA category for type-derived P&L accounts (merge into the school mapping). */
  plEntries: Record<string, string>
}

interface QboAccountMeta {
  id: number
  acctNum: number | null
  accountType: string
  accountSubType: string
  classification: string
}

// Engine account-number blocks for QBO accounts WITHOUT an AcctNum, derived from
// the QBO account type. Balance-sheet types collapse onto the engine's fixed SFP
// numbers (multiple rows sharing one acct simply sum); P&L accounts get a UNIQUE
// stable number (block + QBO account id) so each stays individually re-mappable.
export const QBO_REVENUE_BASE = 40000
export const QBO_EXPENSE_BASE = 60000

/**
 * Which P&L section an ENGINE account number belongs to, per the QBO blocks
 * above — the single source of truth for the block ranges. Returns null for
 * everything else: balance-sheet accounts, the bare block bases (40000/60000
 * are never assigned since QBO ids start at 1), and the ≥90000 synthetics.
 */
export function qboPlSection(acct: number): 'revenue' | 'expense' | null {
  if (acct > QBO_REVENUE_BASE && acct < QBO_EXPENSE_BASE) return 'revenue'
  if (acct > QBO_EXPENSE_BASE && acct < 90000) return 'expense'
  return null
}

function deriveAcct(meta: QboAccountMeta): { acct: number; category: 'other' | 'fixedOther' | null } {
  const t = meta.accountType
  const sub = meta.accountSubType
  switch (t) {
    case 'Bank':
      return { acct: 100, category: null } // cash
    case 'Accounts Receivable':
      return { acct: 120, category: null } // → tuitionRec via the acct-120 desc reclass
    case 'Other Current Asset':
      if (sub === 'PrepaidExpenses') return { acct: 125, category: null }
      if (sub === 'UndepositedFunds') return { acct: 100, category: null } // cash-equivalent
      return { acct: 120, category: null }
    case 'Fixed Asset':
      return { acct: sub === 'AccumulatedDepreciation' ? 170 : 150, category: null } // ppNet
    case 'Other Asset':
      return { acct: 140, category: null } // ppNet
    case 'Accounts Payable':
    case 'Credit Card':
    case 'Other Current Liability':
      return { acct: 200, category: null } // apAccrued (lease-named rows split out)
    case 'Long Term Liability':
      return { acct: 260, category: null }
    case 'Equity':
      return { acct: 300, category: null } // feeds opening net assets
    case 'Income':
    case 'Other Income':
      return { acct: QBO_REVENUE_BASE + meta.id, category: 'other' }
    case 'Expense':
    case 'Cost of Goods Sold':
    case 'Other Expense':
      return { acct: QBO_EXPENSE_BASE + meta.id, category: 'fixedOther' }
    default: {
      // Fall back on the coarse classification when the type is unrecognized.
      const c = meta.classification
      if (c === 'Asset') return { acct: 120, category: null }
      if (c === 'Liability') return { acct: 200, category: null }
      if (c === 'Equity') return { acct: 300, category: null }
      if (c === 'Revenue') return { acct: QBO_REVENUE_BASE + meta.id, category: 'other' }
      if (c === 'Expense') return { acct: QBO_EXPENSE_BASE + meta.id, category: 'fixedOther' }
      return { acct: -1, category: null } // unknown → caller's synthetic fallback
    }
  }
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
   * Pull the Trial Balance for the [startDate, endDate] window and map to engine
   * rows. BOTH dates are required: QuickBooks IGNORES a lone end_date on this
   * report (it silently falls back to its default "this fiscal year to date"
   * period), so an explicit window is the only way to get as-of data. Callers
   * pass the fiscal-year start + the as-of date (a TB is cumulative-YTD within
   * the fiscal year; balance-sheet accounts are as of endDate).
   *
   * Account numbers: use the account's real AcctNum when it has one (schools that
   * number their chart NBOA-style keep their exact mapping). QuickBooks accounts
   * WITHOUT numbers (QBO's default) are classified by their ACCOUNT TYPE instead —
   * balance-sheet types collapse onto the engine's fixed SFP numbers, and P&L
   * accounts get a unique stable number (block + QBO id) plus a school-mapping
   * entry (revenue → 'other', expense → 'fixedOther') returned in `plEntries` for
   * the caller to merge — so statements compute out of the box and each account
   * remains individually re-mappable later. Truly unknown types fall back to a
   * high synthetic code so they surface as unmapped rather than being dropped.
   */
  async getTrialBalance(
    realmId: string,
    accessToken: string,
    startDate: string,
    endDate: string,
  ): Promise<QboTrialBalance> {
    const metaByName = await this.accountMetaByName(realmId, accessToken)
    const report = (await this.apiGet(
      realmId,
      accessToken,
      `reports/TrialBalance?accounting_method=Accrual&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`,
    )) as { Rows?: { Row?: Array<{ ColData?: Array<{ value?: string }> }> } }

    const rows: QboTrialBalanceRow[] = []
    const plEntries: Record<string, string> = {}
    let synthetic = 90000
    for (const r of report?.Rows?.Row ?? []) {
      const cols = r.ColData ?? []
      const name = (cols[0]?.value ?? '').trim()
      if (!name) continue
      const debit = Number(cols[1]?.value ?? 0) || 0
      const credit = Number(cols[2]?.value ?? 0) || 0
      const meta = metaByName.get(name.toLowerCase())
      let acct: number
      if (meta?.acctNum != null) {
        acct = meta.acctNum
      } else if (meta) {
        const derived = deriveAcct(meta)
        acct = derived.acct >= 0 ? derived.acct : synthetic++
        if (derived.category && derived.acct >= 0) plEntries[String(acct)] = derived.category
      } else {
        acct = synthetic++
      }
      rows.push({ acct, desc: name, total: debit - credit })
    }
    return { rows, plEntries }
  }

  /** The QuickBooks company's display name (best-effort → null on any failure). */
  async getCompanyName(realmId: string, accessToken: string): Promise<string | null> {
    try {
      const data = (await this.apiGet(realmId, accessToken, `companyinfo/${realmId}`)) as {
        CompanyInfo?: { CompanyName?: string }
      }
      const name = data?.CompanyInfo?.CompanyName
      return typeof name === 'string' && name.trim() ? name.trim() : null
    } catch {
      return null
    }
  }

  /**
   * Account metadata keyed by lowercase Name AND FullyQualifiedName (the TB report
   * prints sub-accounts fully qualified, e.g. "Truck:Original Cost").
   */
  private async accountMetaByName(
    realmId: string,
    accessToken: string,
  ): Promise<Map<string, QboAccountMeta>> {
    const data = (await this.apiGet(
      realmId,
      accessToken,
      'query?query=' +
        encodeURIComponent(
          'select Id, Name, FullyQualifiedName, AcctNum, Classification, AccountType, AccountSubType from Account maxresults 1000',
        ),
    )) as {
      QueryResponse?: {
        Account?: Array<{
          Id?: string
          Name?: string
          FullyQualifiedName?: string
          AcctNum?: string
          Classification?: string
          AccountType?: string
          AccountSubType?: string
        }>
      }
    }
    const map = new Map<string, QboAccountMeta>()
    for (const a of data?.QueryResponse?.Account ?? []) {
      const num = Number(a.AcctNum)
      const meta: QboAccountMeta = {
        id: Number(a.Id) || 0,
        acctNum: a.AcctNum != null && Number.isFinite(num) ? num : null,
        accountType: a.AccountType ?? '',
        accountSubType: a.AccountSubType ?? '',
        classification: a.Classification ?? '',
      }
      if (a.Name) map.set(a.Name.toLowerCase(), meta)
      if (a.FullyQualifiedName) map.set(a.FullyQualifiedName.toLowerCase(), meta)
    }
    return map
  }
}
