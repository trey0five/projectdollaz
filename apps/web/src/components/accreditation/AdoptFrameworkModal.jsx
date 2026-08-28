// ─────────────────────────────────────────────────────────────────────────────
// AdoptFrameworkModal — pick an accreditor framework and pull its full standards
// catalog into the school's register. Built on the shared EntityFormModal shell
// (this is a plain modal, NOT a RecordFlow — the AddDataWizard configs are
// untouched). Radio CARDS: accreditor + version, standard/assurance counts, a
// rubric-label preview, alias chips ("Also known as: NCA CASI · SACS CASI…" —
// a discovery affordance, since a Georgia school knows its accreditor as NCA
// CASI and must still find the one Cognia card), and an "Adopted" badge when the
// school already carries it (re-adopt is idempotent — it fills gaps, never
// dupes). Submit → POST adopt → the caller refreshes standards + readiness.
//
// AND REMOVAL LIVES HERE TOO, on the same screen, because adopt and un-adopt are
// one decision: this is the only place you can see what you already hold while
// choosing what to change. Removal is always permitted; what stands between a
// mis-click and a year of lost work is the COUNT (see frameworkRemoval.js).
//
// WS2 — SUPERSESSION lives here for the same reason. A superseded framework
// (cognia_2022 once the rev. 2025 row ships):
//   · is HIDDEN from schools that do not hold it — the server 409s a fresh
//     adoption anyway (R12), and a card you cannot pick is noise;
//   · for a school that HOLDS it, keeps every path it ever had, gains a quiet
//     "rev. available" badge, and offers UPGRADE — a read-only preflight
//     (upgrade-impact, rendered verbatim below) followed by an explicit
//     confirm, the removal flow's own two-call discipline;
//   · steers: the SUCCESSOR's card hides its plain Adopt radio for a school
//     holding the predecessor, pointing at Upgrade instead — adopting both
//     editions side-by-side is the one state that blocks the one-click path.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Compass, Check, AlertTriangle, ArrowUpCircle } from 'lucide-react'
import EntityFormModal from '../ui/EntityFormModal.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import RecognitionChips from './RecognitionChips.jsx'
import { useUiV2 } from '../../context/UiFlagContext.jsx'
import { removalLines, isCostless } from '../../lib/frameworkRemoval.js'
import { upgradeLines, upgradeBlockers } from '../../lib/frameworkUpgrade.js'

const AMBER = '#F59E0B'

function FrameworkCard({ fw, selected, onSelect, onRemove, onUpgrade, steerToUpgrade, v2 }) {
  // A predecessor-holder is steered to Upgrade: the successor card renders as a
  // signpost, not a radio — selecting it would land the school in the dual-hold
  // state that 409-blocks its own one-click upgrade.
  const selectable = !steerToUpgrade
  return (
    // The Remove control is a SIBLING of the radio, never nested inside it — a
    // button inside a button is invalid HTML and, worse here, one mis-aimed
    // click away from selecting the framework you meant to delete.
    <div className="relative sm:col-span-2" data-testid={`framework-card-${fw.code}`}>
    <button
      type="button"
      role={selectable ? 'radio' : undefined}
      aria-checked={selectable ? selected : undefined}
      disabled={!selectable}
      onClick={selectable ? () => onSelect(fw.code) : undefined}
      className={`w-full rounded-xl border-2 px-4 py-3 text-left transition ${
        selected
          ? 'border-[#F59E0B] bg-[#F59E0B]/10'
          : v2
            ? 'border-rule/80 bg-white hover:border-[#F59E0B]/60'
            : 'border-white/15 bg-white/5 hover:border-[#F59E0B]/50'
      } ${selectable ? '' : 'cursor-default'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${
              v2 ? 'text-[#b45309]' : 'text-[#fbbf24]/90'
            }`}
          >
            {fw.accreditor} · {fw.version}
            {/* Accreditor-recognition badges (NCPSA / ICAISA) — quiet chips,
                nothing at all for the (many) frameworks with none. */}
            <RecognitionChips recognitions={fw.recognitions} light={v2} />
          </p>
          <p
            className={`mt-0.5 truncate text-[14.5px] font-semibold ${
              v2 ? 'text-navy' : 'text-white'
            }`}
          >
            {fw.name}
          </p>
          <p className={`mt-1 text-[12.5px] ${v2 ? 'text-muted' : 'text-white/60'}`}>
            {fw.standardCount} standards
            {fw.assuranceCount ? ` · ${fw.assuranceCount} assurances` : ''}
            {fw.indexMax ? ` · index ${fw.indexMin}–${fw.indexMax}` : ''}
          </p>
          {Array.isArray(fw.rubricLabels) && fw.rubricLabels.length ? (
            <p className={`mt-1.5 text-[12px] ${v2 ? 'text-muted/80' : 'text-white/45'}`}>
              Rubric: {fw.rubricLabels.join(' → ')}
            </p>
          ) : null}
          {/* WS1 — aliases as a DISCOVERY affordance: the same framework under
              every name a school might know it by. */}
          {Array.isArray(fw.aliases) && fw.aliases.length ? (
            <p
              data-testid="framework-aliases"
              className={`mt-1.5 text-[11.5px] ${v2 ? 'text-muted/70' : 'text-white/40'}`}
            >
              Also known as: {fw.aliases.join(' · ')}
            </p>
          ) : null}
          {steerToUpgrade ? (
            <p className={`mt-2 text-[12.5px] font-medium ${v2 ? 'text-[#b45309]' : 'text-[#fde68a]'}`}>
              You hold the {steerToUpgrade.version} register — use Upgrade on it to move here with
              your scores and evidence carried over.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {selectable ? (
            <span
              aria-hidden
              className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                selected ? 'border-[#F59E0B]' : v2 ? 'border-rule' : 'border-white/25'
              }`}
              style={selected ? { backgroundColor: AMBER } : undefined}
            >
              {selected ? <Check size={12} className="text-navy" strokeWidth={3} /> : null}
            </span>
          ) : null}
          {fw.adopted ? (
            <span
              className={
                v2
                  ? 'rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700'
                  : 'rounded-md border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300'
              }
            >
              Adopted · {fw.adoptedCount}
            </span>
          ) : null}
          {/* WS2 — quiet, never blocking: the register keeps working exactly as
              it always did; this is an offer, not a nag. */}
          {fw.adopted && fw.supersededBy ? (
            <span
              data-testid="superseded-badge"
              className={
                v2
                  ? 'rounded-md border border-[#F59E0B]/50 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700'
                  : 'rounded-md border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#fde68a]'
              }
            >
              Superseded — rev. {fw.supersededBy.version ?? fw.supersededBy.code} available
            </span>
          ) : null}
        </div>
      </div>
    </button>
    <div className="absolute bottom-2.5 right-3 flex items-center gap-2.5">
      {/* The one-click path to the current edition — preflight first, always. */}
      {fw.adopted && fw.supersededBy && fw.upgrade?.available && onUpgrade ? (
        <button
          type="button"
          data-testid={`framework-upgrade-${fw.code}`}
          onClick={() => onUpgrade(fw)}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-semibold transition ${
            v2
              ? 'text-[#b45309] hover:text-amber-800 hover:underline underline-offset-2'
              : 'text-[#fde68a] hover:text-[#fbbf24] hover:underline underline-offset-2'
          }`}
        >
          <ArrowUpCircle size={13} aria-hidden /> Upgrade
        </button>
      ) : null}
      {/* Only for a framework you actually hold, and deliberately understated:
          this is the least-used control on the screen and the most destructive. */}
      {fw.adopted && onRemove ? (
        <button
          type="button"
          onClick={() => onRemove(fw)}
          className={`rounded-md px-2 py-0.5 text-[12px] font-semibold underline-offset-2 transition hover:underline ${
            v2 ? 'text-muted hover:text-red-700' : 'text-white/50 hover:text-red-300'
          }`}
        >
          Remove
        </button>
      ) : null}
    </div>
    </div>
  )
}

/**
 * The removal confirmation. Renders ONLY server-counted figures — there is no
 * client-side arithmetic here and no fallback sentence, because a confirmation
 * that disagrees with the delete it authorises is the worst bug this screen
 * could have. While the count is loading it says so rather than guessing.
 */
function RemovePanel({ fw, impact, loading, error, busy, onCancel, onConfirm, v2 }) {
  const { losses, survives } = removalLines(impact)
  const costless = isCostless(impact)
  return (
    <div
      data-testid="framework-remove-confirm"
      className={`rounded-xl border-2 px-4 py-3.5 sm:col-span-2 ${
        v2 ? 'border-red-300 bg-red-50' : 'border-red-400/40 bg-red-400/10'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={17} className={v2 ? 'mt-0.5 text-red-600' : 'mt-0.5 text-red-300'} />
        <div className="min-w-0 flex-1">
          <p className={`text-[14px] font-semibold ${v2 ? 'text-navy' : 'text-white'}`}>
            Remove {fw.name}?
          </p>

          {loading ? (
            <p className={`mt-1.5 text-[13px] ${v2 ? 'text-muted' : 'text-white/60'}`}>
              Counting what this would remove…
            </p>
          ) : error ? (
            <p className={`mt-1.5 text-[13px] ${v2 ? 'text-red-700' : 'text-red-200'}`}>{error}</p>
          ) : (
            <>
              <ul className={`mt-1.5 space-y-0.5 text-[13px] ${v2 ? 'text-navy/80' : 'text-white/75'}`}>
                {losses.map((l) => (
                  <li key={l}>· {l}</li>
                ))}
              </ul>
              {/* An untouched framework is a tidy-up, not a loss — say so rather
                  than alarming somebody who adopted it by accident a minute ago. */}
              {costless ? (
                <p className={`mt-1.5 text-[12.5px] ${v2 ? 'text-muted' : 'text-white/55'}`}>
                  You haven’t scored or evidenced anything against this framework yet.
                </p>
              ) : null}
              {survives.map((line) => (
                <p
                  key={line}
                  className={`mt-1.5 text-[12.5px] ${v2 ? 'text-muted' : 'text-white/55'}`}
                >
                  {line}
                </p>
              ))}
            </>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition disabled:opacity-50 ${
                v2
                  ? 'border-rule bg-white text-navy hover:border-navy/40'
                  : 'border-white/20 bg-white/5 text-white hover:border-white/40'
              }`}
            >
              Keep it
            </button>
            <button
              type="button"
              data-testid="framework-remove-confirm-btn"
              onClick={onConfirm}
              disabled={busy || loading || !!error}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Removing…' : 'Remove framework'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * WS2 — the upgrade confirmation, the RemovePanel's twin with the opposite
 * promise. Renders the read-only preflight VERBATIM (upgradeLines — every
 * figure server-counted, nothing while loading, blockers disable the confirm)
 * and only then runs the one-transaction re-point.
 */
function UpgradePanel({ fw, impact, loading, error, busy, onCancel, onConfirm, v2 }) {
  const { carried, notes } = upgradeLines(impact)
  const blockers = upgradeBlockers(impact)
  const toName = impact?.to?.name ?? fw.supersededBy?.name ?? 'the newer edition'
  return (
    <div
      data-testid="framework-upgrade-confirm"
      className={`rounded-xl border-2 px-4 py-3.5 sm:col-span-2 ${
        v2 ? 'border-[#F59E0B]/60 bg-amber-50' : 'border-[#F59E0B]/50 bg-[#F59E0B]/10'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <ArrowUpCircle
          size={17}
          className={v2 ? 'mt-0.5 text-[#b45309]' : 'mt-0.5 text-[#fde68a]'}
        />
        <div className="min-w-0 flex-1">
          <p className={`text-[14px] font-semibold ${v2 ? 'text-navy' : 'text-white'}`}>
            Upgrade {fw.name} to {toName}?
          </p>

          {loading ? (
            <p className={`mt-1.5 text-[13px] ${v2 ? 'text-muted' : 'text-white/60'}`}>
              Counting what carries over…
            </p>
          ) : error ? (
            <p className={`mt-1.5 text-[13px] ${v2 ? 'text-red-700' : 'text-red-200'}`}>{error}</p>
          ) : (
            <>
              <ul className={`mt-1.5 space-y-0.5 text-[13px] ${v2 ? 'text-navy/80' : 'text-white/80'}`}>
                {carried.map((l) => (
                  <li key={l}>· {l}</li>
                ))}
              </ul>
              {notes.map((line) => (
                <p
                  key={line}
                  className={`mt-1.5 text-[12.5px] ${v2 ? 'text-muted' : 'text-white/60'}`}
                >
                  {line}
                </p>
              ))}
              {blockers.map((line) => (
                <p
                  key={line}
                  className={`mt-2 flex items-start gap-1.5 text-[12.5px] font-medium ${
                    v2 ? 'text-red-700' : 'text-red-200'
                  }`}
                >
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
                  {line}
                </p>
              ))}
            </>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition disabled:opacity-50 ${
                v2
                  ? 'border-rule bg-white text-navy hover:border-navy/40'
                  : 'border-white/20 bg-white/5 text-white hover:border-white/40'
              }`}
            >
              Not now
            </button>
            <button
              type="button"
              data-testid="framework-upgrade-confirm-btn"
              onClick={onConfirm}
              disabled={busy || loading || !!error || blockers.length > 0}
              className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-navy transition hover:brightness-110 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #fde68a 0%, #fbbf24 55%, #f59e0b 100%)' }}
            >
              {busy ? 'Upgrading…' : 'Upgrade — everything carries over'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdoptFrameworkModal({
  open,
  onClose,
  frameworks,
  onAdopt,
  onRemovalImpact = null,
  onRemove = null,
  // WS2 — the two-call upgrade seam (both async; the caller owns refreshes).
  onUpgradeImpact = null,
  onUpgrade = null,
  // F1 — persist the optional last-review-date after a successful adoption
  // (fail-soft: the Journey tab's setup card remains the recovery path).
  onSaveCycleDate = null,
  reduce,
}) {
  const v2 = useUiV2()
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  // F1 — the one optional extra field (deliberately not a RecordFlow step).
  const [lastReviewDate, setLastReviewDate] = useState('')
  // ── removal state: which framework, its server-counted impact, and progress ──
  const [removing, setRemoving] = useState(null) // the framework being confirmed
  const [impact, setImpact] = useState(null)
  const [impactErr, setImpactErr] = useState('')
  const [impactLoading, setImpactLoading] = useState(false)
  const [removeBusy, setRemoveBusy] = useState(false)
  // ── upgrade state: same shape, opposite promise ─────────────────────────────
  const [upgrading, setUpgrading] = useState(null) // the OLD framework being confirmed
  const [upImpact, setUpImpact] = useState(null)
  const [upErr, setUpErr] = useState('')
  const [upLoading, setUpLoading] = useState(false)
  const [upBusy, setUpBusy] = useState(false)

  const startRemove = async (fw) => {
    setUpgrading(null)
    setRemoving(fw)
    setImpact(null)
    setImpactErr('')
    setImpactLoading(true)
    try {
      const res = await onRemovalImpact(fw.code)
      // NO FALLBACK NUMBERS. If the count did not arrive, the confirm button
      // stays disabled — authorising a delete against invented figures would be
      // worse than making the user try again.
      if (!res) throw new Error('no impact')
      setImpact(res)
    } catch {
      setImpactErr('Could not work out what this would remove. Please try again.')
    } finally {
      setImpactLoading(false)
    }
  }

  const cancelRemove = () => {
    setRemoving(null)
    setImpact(null)
    setImpactErr('')
  }

  const confirmRemove = async () => {
    setRemoveBusy(true)
    try {
      await onRemove(removing.code)
      // The modal STAYS OPEN: removing one of three frameworks is rarely the
      // whole errand, and the list behind this panel has already refreshed.
      if (selected === removing.code) setSelected(null)
      cancelRemove()
    } catch {
      setImpactErr('Could not remove this framework. Please try again.')
    } finally {
      setRemoveBusy(false)
    }
  }

  const startUpgrade = async (fw) => {
    cancelRemove()
    setUpgrading(fw)
    setUpImpact(null)
    setUpErr('')
    setUpLoading(true)
    try {
      const res = await onUpgradeImpact(fw.code)
      // Same rule as removal: NO FALLBACK NUMBERS — the confirm stays disabled
      // until the real preflight arrives.
      if (!res) throw new Error('no impact')
      setUpImpact(res)
    } catch {
      setUpErr('Could not work out what this upgrade carries over. Please try again.')
    } finally {
      setUpLoading(false)
    }
  }

  const cancelUpgrade = () => {
    setUpgrading(null)
    setUpImpact(null)
    setUpErr('')
  }

  const confirmUpgrade = async () => {
    setUpBusy(true)
    try {
      await onUpgrade(upgrading.code)
      if (selected === upgrading.code) setSelected(null)
      cancelUpgrade()
    } catch {
      setUpErr('Could not upgrade this framework. Please try again.')
    } finally {
      setUpBusy(false)
    }
  }

  const loading = frameworks === null
  const all = frameworks ?? []
  // R12, mirrored: a superseded framework is not offered to a school that does
  // not hold it (the server would 409 the adopt anyway).
  const list = all.filter((fw) => !(fw.supersededBy && !fw.adopted))
  const selectedFw = list.find((f) => f.code === selected) ?? null
  // fw.code → the ADOPTED predecessor this fw supersedes (if any) — the steer.
  const predecessorOf = (fw) =>
    all.find((p) => p.adopted && p.supersededBy && p.supersededBy.code === fw.code) ?? null

  const submit = async (e) => {
    e.preventDefault()
    if (!selected) {
      setErr('Choose a framework to adopt.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onAdopt(selected)
      // The optional anchor rides along AFTER a successful adoption — fail-soft
      // by design: the adoption stands either way, and the Journey tab's setup
      // card can always take the date later.
      if (lastReviewDate && selectedFw?.id && onSaveCycleDate) {
        try {
          await onSaveCycleDate({ frameworkId: selectedFw.id, lastReviewDate })
        } catch {
          /* journey setup card remains the recovery path */
        }
      }
      onClose()
    } catch {
      setErr('Could not adopt this framework. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityFormModal
      open={open}
      icon={Compass}
      title="Adopt a framework"
      subtitle="Pull the accreditor's full standards catalog into your register — codes, order, and rubric included"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={selectedFw?.adopted ? 'Re-adopt (fills gaps)' : 'Adopt framework'}
      reduce={reduce}
      wide
    >
      {loading ? (
        <p className={`text-[13px] sm:col-span-2 ${v2 ? 'text-muted' : 'text-white/55'}`}>
          Loading frameworks…
        </p>
      ) : list.length === 0 ? (
        <p className={`text-[13px] sm:col-span-2 ${v2 ? 'text-muted' : 'text-white/55'}`}>
          No frameworks are available yet — the catalog may still be seeding.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Accreditation framework" className="space-y-2.5 sm:col-span-2">
          {list.map((fw) =>
            // The confirmation REPLACES the card it belongs to, so the thing you
            // are about to change and the question about changing it are never
            // two separate places on the screen.
            removing?.code === fw.code ? (
              <RemovePanel
                key={fw.code}
                fw={fw}
                impact={impact}
                loading={impactLoading}
                error={impactErr}
                busy={removeBusy}
                onCancel={cancelRemove}
                onConfirm={confirmRemove}
                v2={v2}
              />
            ) : upgrading?.code === fw.code ? (
              <UpgradePanel
                key={fw.code}
                fw={fw}
                impact={upImpact}
                loading={upLoading}
                error={upErr}
                busy={upBusy}
                onCancel={cancelUpgrade}
                onConfirm={confirmUpgrade}
                v2={v2}
              />
            ) : (
              <FrameworkCard
                key={fw.code}
                fw={fw}
                selected={selected === fw.code}
                onSelect={setSelected}
                onRemove={onRemove && onRemovalImpact ? startRemove : null}
                onUpgrade={onUpgrade && onUpgradeImpact ? startUpgrade : null}
                steerToUpgrade={!fw.adopted ? predecessorOf(fw) : null}
                v2={v2}
              />
            ),
          )}
        </div>
      )}

      {/* F1 — ONE optional field, not a wizard step: the date that anchors the
          six-year journey, offered at the moment of adoption because that is
          when a school is thinking about its accreditor. Skippable forever —
          the Journey tab's setup card asks the same question later. */}
      {!loading && list.length > 0 ? (
        <label className="block sm:col-span-2">
          <span
            className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
              v2 ? 'text-gold' : 'text-gold-light/80'
            }`}
          >
            Last review date (if you have one)
          </span>
          <DatePicker
            value={lastReviewDate}
            onChange={setLastReviewDate}
            aria-label="Last review date (optional)"
            className="field-lux mt-1"
          />
          <span className={`mt-1 block text-[12px] leading-snug ${v2 ? 'text-muted' : 'text-white/40'}`}>
            Optional — anchors your accreditation journey (cycle countdown, milestones). You can set
            it any time on the Journey tab.
          </span>
        </label>
      ) : null}
    </EntityFormModal>
  )
}
