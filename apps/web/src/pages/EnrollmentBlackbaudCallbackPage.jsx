// Phase 2 — Blackbaud SKY OAuth return. Blackbaud redirects here with ?code and
// ?state (the schoolId). We exchange + store the connection via the API, then
// bounce back to the Enrollment page. Mirrors QbCallbackPage; Blackbaud has no
// realmId, so the callback body is just { code }. Lives inside AuthedLayout.
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../lib/api.js'

export default function EnrollmentBlackbaudCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const code = params.get('code')
  const schoolId = params.get('state')
  const missing = !code || !schoolId

  const [msg, setMsg] = useState('Finishing the Blackbaud connection…')
  const [error, setError] = useState(false)
  const ran = useRef(false)

  useEffect(() => {
    if (missing || ran.current) return
    ran.current = true
    enrollmentApi
      .callback(schoolId, { code })
      .then(() => {
        setMsg('Blackbaud connected. Redirecting…')
        setTimeout(() => navigate('/enrollment'), 1200)
      })
      .catch((e) => {
        setError(true)
        setMsg(apiErrorMessage(e, 'Could not complete the Blackbaud connection.'))
      })
  }, [missing, code, schoolId, navigate])

  if (missing) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-20 text-center">
        <p className="text-[16px] text-danger">Missing Blackbaud authorization details.</p>
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
