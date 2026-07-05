// Phase 6 — QuickBooks OAuth return. Intuit redirects here with ?code, ?realmId,
// and ?state (the schoolId — or `org:<orgId>` for the organization-level
// Diocesan QuickBooks connection). We exchange + store the connection via the
// API, then bounce back to Settings → Integrations. Lives inside AuthedLayout.
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { qboApi, qboCompanyApi, apiErrorMessage } from '../lib/api.js'

export default function QbCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const code = params.get('code')
  const realmId = params.get('realmId')
  const state = params.get('state')
  // Org-level connect encodes its state as `org:<orgId>`; a bare UUID is the
  // original per-school flow.
  const isOrg = !!state && state.startsWith('org:')
  const orgId = isOrg ? state.slice(4) : null
  const schoolId = isOrg ? null : state
  const missing = !code || !realmId || !state

  const [msg, setMsg] = useState('Finishing the QuickBooks connection…')
  const [error, setError] = useState(false)
  const ran = useRef(false)

  useEffect(() => {
    if (missing || ran.current) return
    ran.current = true
    if (isOrg) {
      qboCompanyApi
        .callback(orgId, { code, realmId })
        .then((res) => {
          const folded = res.data?.replacedSchoolConnections ?? []
          setMsg(
            folded.length > 0
              ? `Organization QuickBooks connected. The direct connection for ${folded.join(
                  ', ',
                )} was folded into the organization connection. Redirecting…`
              : 'Organization QuickBooks connected. Redirecting…',
          )
          // Land on the mapping step so locations get assigned to schools next.
          setTimeout(
            () => navigate('/settings/integrations?orgqb=map'),
            folded.length > 0 ? 2600 : 1200,
          )
        })
        .catch((e) => {
          setError(true)
          setMsg(apiErrorMessage(e, 'Could not complete the QuickBooks connection.'))
        })
      return
    }
    qboApi
      .callback(schoolId, { code, realmId })
      .then(() => {
        setMsg('QuickBooks connected. Redirecting…')
        setTimeout(() => navigate('/settings/integrations'), 1200)
      })
      .catch((e) => {
        setError(true)
        setMsg(apiErrorMessage(e, 'Could not complete the QuickBooks connection.'))
      })
  }, [missing, isOrg, orgId, code, realmId, schoolId, navigate])

  if (missing) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-20 text-center">
        <p className="text-[16px] text-danger">Missing QuickBooks authorization details.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center gap-3 px-4 py-20 text-center">
      {!error && <Loader2 size={22} className="animate-spin text-gold" />}
      <p className={`text-[16px] ${error ? 'text-danger' : 'text-muted'}`}>{msg}</p>
    </div>
  )
}
