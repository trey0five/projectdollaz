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
import { Pill } from '../ui/surface/index.js'

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
      className={`panel relative mb-6 p-5 sm:p-6 ${connected || orgFed ? '' : 'panel-attention panel-watch'}`}
    >
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex shrink-0 text-ink2">
            {connected || orgFed ? <CheckCircle2 size={22} aria-hidden="true" className="tone-good" /> : <Plug size={22} aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            {!configured ? (
              <>
                <h2 id="datahub-qbo-title" className="text-heading font-semibold text-ink">
                  QuickBooks isn&apos;t set up on this server yet.
                </h2>
                <p className="mt-1 max-w-xl text-small leading-relaxed text-ink2">
                  When QuickBooks is enabled, you&apos;ll be able to connect it here and pull your
                  trial balance automatically — no spreadsheet exports.
                </p>
              </>
            ) : connected ? (
              <>
                <h2 id="datahub-qbo-title" className="flex flex-wrap items-center gap-2 text-heading font-semibold text-ink">
                  QuickBooks connected
                  <Pill variant="status" tone="good">Live</Pill>
                </h2>
                <p className="mt-1 max-w-xl text-small leading-relaxed text-ink2">
                  We can pull your current trial balance straight from QuickBooks.
                  {qb.realmId ? (
                    <span>
                      {' '}
                      Connected to realm <span className="font-semibold text-ink">{qb.realmId}</span>
                      {qb.environment ? ` · ${qb.environment}` : ''}.
                    </span>
                  ) : null}
                </p>
              </>
            ) : orgFed ? (
              <>
                <h2 id="datahub-qbo-title" className="flex flex-wrap items-center gap-2 text-heading font-semibold text-ink">
                  QuickBooks connected — through your organization
                  <Pill variant="status" tone="good">Via organization</Pill>
                </h2>
                <p className="mt-1 max-w-xl text-small leading-relaxed text-ink2">
                  Your numbers flow in from{' '}
                  <span className="font-semibold text-ink">
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
                      <span className="font-semibold text-ink">{orgFedNames.join(', ')}</span>
                    </>
                  )}
                  . Imports run from the organization’s QuickBooks in Settings.
                </p>
              </>
            ) : (
              <>
                <h2 id="datahub-qbo-title" className="text-heading font-semibold text-ink">
                  The fast way: connect QuickBooks.
                </h2>
                <p className="mt-1 max-w-xl text-small leading-relaxed text-ink2">
                  Connect QuickBooks once and we&apos;ll pull your trial balance for you — no
                  spreadsheet exports, no manual entry.
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] italic text-ink2">
                  <Sparkles size={12} className="text-penny" aria-hidden="true" />
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
                  className="btn btn-primary"
                >
                  Sync trial balance now <ArrowRight size={14} aria-hidden="true" />
                </Link>
                <Link
                  to="/settings/integrations"
                  className="dt-link justify-center text-small"
                >
                  Manage connection
                </Link>
              </>
            ) : orgFed ? (
              <Link
                to="/settings/integrations"
                className="btn btn-primary"
              >
                Manage in Settings <ArrowRight size={14} aria-hidden="true" />
              </Link>
            ) : (
              <Link
                to="/settings/integrations"
                className="btn btn-primary"
              >
                Connect QuickBooks <ArrowRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </div>
    </motion.section>
  )
}
