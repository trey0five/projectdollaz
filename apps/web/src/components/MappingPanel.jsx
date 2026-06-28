import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { fmt } from '../lib/format.js'

/** Surfaces revenue/expense accounts that aren't in ACCT_MAP. */
export default function MappingPanel({ unmapped }) {
  if (!unmapped || unmapped.length === 0) return null
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="no-print mb-6 overflow-hidden rounded-lg border border-l-4 border-[#e8c96a] border-l-gold bg-[#fff8e6] px-5 py-4"
    >
      <h4 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#7a5e00]">
        <AlertTriangle size={14} /> Accounts Requiring Review
      </h4>
      {unmapped.map((r) => (
        <div key={r.acct} className="py-0.5 text-xs text-[#5a4400]">
          Account {r.acct} — “{r.desc}” — Balance: {fmt(Math.abs(r.total))}
        </div>
      ))}
    </motion.div>
  )
}
