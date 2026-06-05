import { motion } from 'framer-motion'
import { AlertOctagon } from 'lucide-react'
import { fmt } from '../lib/format.js'

/** Shown when the imported trial balance does not balance (debits ≠ credits). */
export default function ValidationBanner({ validation }) {
  if (!validation || validation.balanced) return null
  const { totalDebits, totalCredits, difference } = validation
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="no-print mb-6 overflow-hidden rounded-lg border border-l-4 border-[#e0a0a0] border-l-danger bg-[#fdeeee] px-5 py-4"
    >
      <h4 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-danger">
        <AlertOctagon size={14} /> Trial Balance Out of Balance
      </h4>
      <div className="text-xs text-[#6a1414]">
        Debits and credits do not net to zero. Total debits {fmt(totalDebits)} vs total
        credits {fmt(totalCredits)} — difference {fmt(difference)}. Review the imported
        trial balance before relying on these statements.
      </div>
    </motion.div>
  )
}
