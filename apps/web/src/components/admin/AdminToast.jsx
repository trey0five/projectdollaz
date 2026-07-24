// AdminToast — a tiny local success/error toast for the admin console (no global
// provider, mirroring InviteResultToast). Controlled: pass a { ok, message } toast
// object + onDismiss; it auto-dismisses. White card on the cream admin surface.
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
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-white px-4 py-3 text-[14px] font-medium text-ink shadow-card">
            {toast.ok ? (
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-danger" />
            )}
            <span className="max-w-[44ch]">{toast.message}</span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="ml-1 shrink-0 rounded p-0.5 text-muted hover:text-ink"
            >
              <X size={15} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
