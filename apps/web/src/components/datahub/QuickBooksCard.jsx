// ─────────────────────────────────────────────────────────────────────────────
// Data hub — QuickBooks "fast path" card (top, full-width, gold-accented). Reads
// the `quickbooks` block from the data-status payload, which mirrors qboApi.status
// and tolerates the {configured:false, connected:false} fallback the status read
// returns on 401. Three honest states. v1 LINKS to /settings/integrations for the
// connect flow and the existing single-TB sync (it does NOT re-implement the sync
// POST) — pulling every year/month automatically is a later phase, and the copy
// says so plainly so the hub never over-promises.
// ─────────────────────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Plug, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react'

export default function QuickBooksCard({ quickbooks }) {
  const reduce = useReducedMotion()
  const qb = quickbooks || { configured: false, connected: false }
  const connected = !!qb.connected
  const configured = !!qb.configured
  // Diocesan QuickBooks: no direct connection, but the school is mapped in the
  // organization's QuickBooks company — treat it as connected (green), just via
  // the org. A direct connection always wins the display.
  const orgFed = !connected && !!qb.orgFed
  const orgFedNames = orgFed ? (qb.orgFed.valueNames ?? []) : []

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      aria-labelledby="datahub-qbo-title"
      className="relative mb-6 overflow-hidden rounded-2xl border-2 border-gold/45 bg-white p-5 shadow-card sm:p-6"
    >
      {/* Decorative gold wash so the fast-path reads as the hero action. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gold/10 blur-2xl"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
              connected || orgFed ? 'bg-emerald-100 text-emerald-700' : 'bg-gold/15 text-gold'
            }`}
          >
            {connected || orgFed ? <CheckCircle2 size={24} /> : <Plug size={22} />}
          </span>
          <div className="min-w-0">
            {!configured ? (
              <>
                <h2 id="datahub-qbo-title" className="font-serif text-lg font-semibold text-navy">
                  QuickBooks isn&apos;t set up on this server yet.
                </h2>
                <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-muted">
                  When QuickBooks is enabled, you&apos;ll be able to connect it here and pull your
                  trial balance automatically — no spreadsheet exports.
                </p>
              </>
            ) : connected ? (
              <>
                <h2 id="datahub-qbo-title" className="flex flex-wrap items-center gap-2 font-serif text-lg font-semibold text-navy">
                  QuickBooks connected
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[13px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                    <CheckCircle2 size={12} /> Live
                  </span>
                </h2>
                <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-muted">
                  We can pull your current trial balance straight from QuickBooks.
                  {qb.realmId ? (
                    <span className="text-muted/90">
                      {' '}
                      Connected to realm <span className="font-semibold text-navy">{qb.realmId}</span>
                      {qb.environment ? ` · ${qb.environment}` : ''}.
                    </span>
                  ) : null}
                </p>
              </>
            ) : orgFed ? (
              <>
                <h2 id="datahub-qbo-title" className="flex flex-wrap items-center gap-2 font-serif text-lg font-semibold text-navy">
                  QuickBooks connected — through your organization
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[13px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                    <CheckCircle2 size={12} /> Via organization
                  </span>
                </h2>
                <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-muted">
                  Your numbers flow in from{' '}
                  <span className="font-semibold text-navy">
                    {qb.orgFed.companyName || 'your organization’s QuickBooks company'}
                  </span>
                  {orgFedNames.length > 0 && (
                    <>
                      {' '}—{' '}
                      {qb.orgFed.dimension === 'class'
                        ? orgFedNames.length === 1
                          ? 'class'
                          : 'classes'
                        : orgFedNames.length === 1
                          ? 'location'
                          : 'locations'}{' '}
                      <span className="font-semibold text-navy">{orgFedNames.join(', ')}</span>
                    </>
                  )}
                  . Imports run from the organization’s QuickBooks in Settings.
                </p>
              </>
            ) : (
              <>
                <h2 id="datahub-qbo-title" className="font-serif text-lg font-semibold text-navy">
                  The fast way: connect QuickBooks.
                </h2>
                <p className="mt-1 max-w-xl text-[15px] leading-relaxed text-muted">
                  Connect QuickBooks once and we&apos;ll pull your trial balance for you — no
                  spreadsheet exports, no manual entry.
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[14px] italic text-muted/80">
                  <Sparkles size={12} className="text-gold" aria-hidden="true" />
                  Today this brings in your trial balance. Pulling every year and month automatically
                  is coming soon.
                </p>
              </>
            )}
          </div>
        </div>

        {/* CTAs (configured states only). v1 links rather than re-implements. */}
        {configured && (
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            {connected ? (
              <>
                <Link
                  to="/settings/integrations"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold-gradient px-4 py-2.5 text-[15px] font-bold uppercase tracking-[0.08em] text-navy shadow-glow transition-transform hover:-translate-y-0.5"
                >
                  Sync trial balance now <ArrowRight size={15} />
                </Link>
                <Link
                  to="/settings/integrations"
                  className="text-center text-[14px] font-semibold text-muted underline-offset-2 transition-colors hover:text-gold hover:underline"
                >
                  Manage connection
                </Link>
              </>
            ) : orgFed ? (
              <Link
                to="/settings/integrations"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold-gradient px-4 py-2.5 text-[15px] font-bold uppercase tracking-[0.08em] text-navy shadow-glow transition-transform hover:-translate-y-0.5"
              >
                Manage in Settings <ArrowRight size={15} />
              </Link>
            ) : (
              <Link
                to="/settings/integrations"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold-gradient px-4 py-2.5 text-[15px] font-bold uppercase tracking-[0.08em] text-navy shadow-glow transition-transform hover:-translate-y-0.5"
              >
                Connect QuickBooks <ArrowRight size={15} />
              </Link>
            )}
          </div>
        )}
      </div>
    </motion.section>
  )
}
