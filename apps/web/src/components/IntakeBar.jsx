import { useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Files, Plus, X } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import DragOverlay from './DragOverlay.jsx'
import HeroDropzone from './HeroDropzone.jsx'
import FileStatusCard from './FileStatusCard.jsx'
import EmptySlotCard from './EmptySlotCard.jsx'
import IntakeGuide from './IntakeGuide.jsx'
import PeriodControls from './PeriodControls.jsx'
import SummaryStrip from './SummaryStrip.jsx'
import ExportMenu from './ExportMenu.jsx'
import SaveBar from './SaveBar.jsx'
import { SLOT_ROLES, ROLE_META } from '../lib/roleMeta.js'

const ACCEPT = '.xlsx,.xls,.csv'

const CONFLICT_COPY = {
  duplicate: (c) =>
    `Two files are set to ${c.role.toUpperCase()} — pick one role per file.`,
  unresolved: () => 'Some files need a role — confirm each via its chip.',
  'missing-current': () => 'Add or assign a Current-Year file to preview statements.',
  'ambiguous-period': () =>
    'Two files share the same period-end — set which is Current vs Prior via their chips.',
}

export default function IntakeBar() {
  const { files, byRole, intakeMode, conflicts, loadFiles, loadFilesForRole, status, collapse, canEdit } =
    useApp()
  const inputRef = useRef(null)
  // Override-upload plumbing: a hidden input whose next selection is pinned to
  // the role captured here (used by a history-filled slot's "Upload to override").
  const overrideInputRef = useRef(null)
  const overrideRoleRef = useRef(null)
  const overrideRef = useRef((role) => {
    overrideRoleRef.current = role
    overrideInputRef.current?.click()
  })

  // Which file ids need user attention: any file in a duplicate/unresolved
  // conflict, plus any low-confidence unconfirmed suggestion.
  const reviewIds = useMemo(() => {
    const ids = new Set()
    for (const c of conflicts) {
      if (
        c.kind === 'duplicate' ||
        c.kind === 'unresolved' ||
        c.kind === 'ambiguous-period'
      ) {
        c.fileIds.forEach((id) => ids.add(id))
      }
    }
    for (const f of files) {
      if (
        f.status === 'ready' &&
        !f.roleConfirmed &&
        (f.role === 'unknown' || (f.suggestion?.confidence ?? 0) < 0.5)
      ) {
        ids.add(f.id)
      }
    }
    return ids
  }, [files, conflicts])

  // The ids that cleanly resolved into a single role slot (via the existing
  // resolveRoles-derived byRole). Any other file — duplicate-role claimant,
  // unknown/unresolved, 'ignore', extra, or still-parsing/errored — is NOT in
  // a slot and must surface in the "Needs a role" overflow row rather than be
  // silently dropped or overwrite a slot.
  const slottedIds = useMemo(() => {
    const ids = new Set()
    for (const role of SLOT_ROLES) {
      const f = byRole[role]
      if (f) ids.add(f.id)
    }
    return ids
  }, [byRole])

  const unslotted = useMemo(
    () => files.filter((f) => !slottedIds.has(f.id)),
    [files, slottedIds]
  )

  // Same-document guard: a new user can drop the SAME trial balance into every
  // slot. Flag the EXACT same uploaded file (name + size) appearing in 2+ slots —
  // a precise signal of the mistake with no false positives (two genuinely
  // different docs won't share name+size; a legit audited-current-year shares a
  // period-end but not the file). History-loaded comparatives are excluded — they
  // aren't a user upload mistake.
  const duplicateSlots = useMemo(() => {
    const slotted = SLOT_ROLES.map((role) => ({ role, f: byRole[role] })).filter(
      (x) => x.f && x.f.status === 'ready' && !x.f.fromHistory
    )
    const groups = new Map()
    for (const { role, f } of slotted) {
      const key = `${f.fileName ?? ''}|${f.fileSize ?? 0}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(role)
    }
    for (const roles of groups.values()) if (roles.length >= 2) return roles
    return null
  }, [byRole])

  const onBrowse = (e) => {
    if (e.target.files?.length) loadFiles(e.target.files)
    e.target.value = ''
  }

  // The set of roles that have a live duplicate conflict. resolveRoles leaves
  // such a slot empty (claimants surface in "Needs a role"); we mark the slot
  // as conflicted so it reads "resolve below" instead of "missing — add one".
  const duplicateRoles = useMemo(() => {
    const s = new Set()
    for (const c of conflicts) {
      if (c.kind === 'duplicate' && c.role) s.add(c.role)
    }
    return s
  }, [conflicts])

  // Dropping/browsing N files INTO one slot should pin only the FIRST file to
  // that slot's role (one file per slot); any extras go through the normal
  // auto-classify path rather than all being force-stamped to the same role.
  const assignToSlot = (role, list) => {
    const arr = Array.from(list)
    if (arr.length === 0) return
    loadFilesForRole(role, [arr[0]])
    if (arr.length > 1) loadFiles(arr.slice(1))
  }

  return (
    <section className="no-print relative border-b border-rule bg-section py-4 sm:py-7">
      <DragOverlay />

      <div className="mx-auto max-w-[1120px] px-4 sm:px-10">
      <AnimatePresence mode="wait">
        {/* ── EMPTY ── */}
        {intakeMode === 'empty' && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Export sits in its own right-aligned row so the dropzone can span
                the full column and stay centered (symmetric with the preview
                placeholder below). */}
            <div className="mb-3 flex justify-end">
              <ExportMenu />
            </div>
            {canEdit ? (
              <>
                <HeroDropzone />
                <div className="mt-4">
                  <IntakeGuide />
                </div>
              </>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-border bg-white px-6 py-12 text-center">
                <p className="font-serif text-lg italic text-muted">
                  No saved statements yet for this school.
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  You have view-only access. Saved periods appear in History.
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* ── COLLAPSED ── */}
        {intakeMode === 'collapsed' && (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex flex-1">
              <SummaryStrip />
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <SaveBar />
              <ExportMenu />
            </div>
          </motion.div>
        )}

        {/* ── REVIEW ── */}
        {intakeMode === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-serif text-lg font-semibold text-navy sm:text-xl">
                Imported trial balances
              </h2>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="btn-ghost w-full shrink-0 justify-center whitespace-nowrap sm:h-[52px] sm:w-[120px]"
                  >
                    <Plus size={16} /> Add
                  </button>
                )}
                <SaveBar />
                <button
                  type="button"
                  onClick={collapse}
                  title="Cancel"
                  className="inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-2 border-border px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted transition-colors hover:border-navy hover:text-navy sm:h-[52px] sm:w-auto"
                >
                  <X size={15} /> Cancel
                </button>
                <div className="w-full shrink-0 sm:w-auto">
                  <ExportMenu />
                </div>
              </div>
            </div>

            {/* plain-English explainer of the three slots */}
            <div className="mb-5">
              <IntakeGuide />
            </div>

            {/* same-document warning (e.g. the same TB dropped into every slot) */}
            {duplicateSlots && (
              <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-l-4 border-[#e8c96a] border-l-gold bg-[#fff8e6] px-4 py-3 text-[13px] text-[#7a5e00]">
                <Files size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">The same file looks like it’s in more than one slot.</p>
                  <p className="mt-0.5">
                    {duplicateSlots.map((r) => ROLE_META[r].plainLabel).join(' and ')} appear to be
                    the same document. Each slot needs a <em>different</em> file — see “What goes
                    where” above. If you only have this year’s books, remove the others and keep just{' '}
                    <span className="font-semibold">#1</span>.
                  </p>
                </div>
              </div>
            )}

            {/* conflict banners */}
            {conflicts.length > 0 && (
              <div className="mb-5 space-y-2">
                {conflicts.map((c, i) => (
                  <div
                    key={`${c.kind}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-l-4 border-[#e8c96a] border-l-gold bg-[#fff8e6] px-4 py-2.5 text-[13px] font-medium text-[#7a5e00]"
                  >
                    <AlertTriangle size={15} className="shrink-0" />
                    {CONFLICT_COPY[c.kind](c)}
                  </div>
                ))}
              </div>
            )}

            {/* THREE ROLE SLOTS — Current Year / Prior Year / Audited FY End.
                Each slot is either a filled FileStatusCard (resolved via
                byRole) or a draggable + clickable EmptySlotCard placeholder. */}
            <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SLOT_ROLES.map((role) => {
                const filled = byRole[role]
                const meta = ROLE_META[role]
                return (
                  <div key={role} className="flex flex-col">
                    <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-navy">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold/15 text-[11px] font-bold text-gold">
                        {meta.step}
                      </span>
                      {meta.plainLabel}
                    </p>
                    <AnimatePresence mode="popLayout" initial={false}>
                      {filled ? (
                        <FileStatusCard
                          key={filled.id}
                          file={filled}
                          needsReview={reviewIds.has(filled.id)}
                          onOverride={
                            filled.fromHistory
                              ? () => overrideRef.current?.(role)
                              : undefined
                          }
                        />
                      ) : canEdit ? (
                        <EmptySlotCard
                          key={`empty-${role}`}
                          role={role}
                          needsAttention={role === 'cy' && !duplicateRoles.has(role)}
                          conflicted={duplicateRoles.has(role)}
                          assignFiles={(list) => assignToSlot(role, list)}
                        />
                      ) : (
                        <div
                          key={`empty-ro-${role}`}
                          className="flex min-h-[196px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-section px-4 py-8 text-center"
                        >
                          <p className="font-serif text-base font-semibold text-navy">{meta.plainLabel}</p>
                          <p className="text-[12px] italic text-muted">Not provided</p>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>

            {/* NEEDS A ROLE — overflow for files that didn't resolve to a single
                slot: duplicate-role claimants, unknown/unresolved, 'ignore',
                extras, plus parsing/error cards. Each keeps its editable
                RoleChip + remove; confirming a role promotes it into its slot. */}
            {unslotted.length > 0 && (
              <div className="mt-6">
                <p className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#7a5e00]">
                  <AlertTriangle size={14} className="text-gold" /> Needs a role
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence mode="popLayout">
                    {unslotted.map((f) => (
                      <FileStatusCard
                        key={f.id}
                        file={f}
                        needsReview={reviewIds.has(f.id)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            <div className="mt-5">
              <PeriodControls />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={onBrowse}
      />
      <input
        ref={overrideInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const role = overrideRoleRef.current
          if (role && e.target.files?.length) assignToSlot(role, e.target.files)
          overrideRoleRef.current = null
          e.target.value = ''
        }}
      />

      {status && (
        <p aria-live="polite" className="mt-4 text-[13px] italic text-muted">
          {status}
        </p>
      )}
      </div>
    </section>
  )
}
