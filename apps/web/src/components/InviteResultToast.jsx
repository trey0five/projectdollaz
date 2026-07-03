// Surfaces the outcome of redeeming an emailed member invite (SchoolContext fires
// `finrep:invite-result` after the first authenticated load). Success is mostly
// self-evident (the joined school is auto-selected), but a bad/expired/wrong-email
// invite would otherwise fail silently — this makes it visible. Auto-dismisses.
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'

export default function InviteResultToast() {
  const [toast, setToast] = useState(null) // { ok, message }

  useEffect(() => {
    const onResult = (e) => {
      const d = e.detail || {}
      setToast({
        ok: !!d.ok,
        message: d.ok
          ? 'Invite accepted — you’ve joined the school.'
          : d.message || 'That invitation could not be accepted.',
      })
    }
    window.addEventListener('finrep:invite-result', onResult)
    return () => window.removeEventListener('finrep:invite-result', onResult)
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), toast.ok ? 5000 : 9000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2"
          role="status"
        >
          <div
            className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[14px] font-medium shadow-card ${
              toast.ok
                ? 'border-emerald-500/30 bg-white text-navy'
                : 'border-danger/30 bg-white text-navy'
            }`}
          >
            {toast.ok ? (
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-danger" />
            )}
            <span className="max-w-[42ch]">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="ml-1 shrink-0 rounded p-0.5 text-muted hover:text-navy"
            >
              <X size={15} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
