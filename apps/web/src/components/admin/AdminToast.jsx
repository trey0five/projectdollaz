// AdminToast — a tiny local success/error toast for the admin console (no global
// provider, mirroring InviteResultToast). Controlled: pass a { ok, message } toast
// object + onDismiss; it auto-dismisses. A float-elevation note with a 2px
// good/risk mark (status = mark + ink text).
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'

export default function AdminToast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(onDismiss, toast.ok ? 4000 : 7000)
    return () => clearTimeout(t)
  }, [toast, onDismiss])

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2"
          role="status"
        >
          <div className={`flex items-start gap-2.5 rounded-lg border border-hair/15 border-l-2 bg-white px-4 py-3 text-[14px] font-medium text-ink shadow-float ${toast.ok ? 'border-l-good' : 'border-l-risk'}`}>
            {toast.ok ? (
              <CheckCircle2 size={17} aria-hidden className="mt-0.5 shrink-0 text-ink2" />
            ) : (
              <AlertTriangle size={17} aria-hidden className="mt-0.5 shrink-0 text-ink2" />
            )}
            <span className="max-w-[44ch]">{toast.message}</span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="ml-1 shrink-0 rounded p-0.5 text-ink2 hover:text-ink"
            >
              <X size={15} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
