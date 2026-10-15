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
//
// PREMIUM UI P4 (a2): light only. Frameworks are hairline choice rows (a 2px
// primary mark when selected, no amber flood), status words are ledger Pills,
// the remove / upgrade confirmations are ruled notes with a semantic mark, and
// every action is a flat Button — the gold-gradient upgrade button and the navy
// v1 branch are gone (the shared modal shell has no dark variant any more).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Compass, Check, AlertTriangle, ArrowUpCircle, Trash2 } from 'lucide-react'
import EntityFormModal, { Field, fieldInput } from '../ui/EntityFormModal.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import RecognitionChips from './RecognitionChips.jsx'
import Button from '../ui/surface/Button.jsx'
import Pill from '../ui/surface/Pill.jsx'
import { removalLines, isCostless } from '../../lib/frameworkRemoval.js'
import { upgradeLines, upgradeBlockers } from '../../lib/frameworkUpgrade.js'
import '../../styles/pending/a2-carry.css'

function FrameworkCard({ fw, selected, onSelect, onRemove, onUpgrade, steerToUpgrade }) {
  // A predecessor-holder is steered to Upgrade: the successor card renders as a
  // signpost, not a radio — selecting it would land the school in the dual-hold
  // state that 409-blocks its own one-click upgrade.
  const selectable = !steerToUpgrade
  const hasFootActions = fw.adopted && ((fw.supersededBy && fw.upgrade?.available && onUpgrade) || onRemove)
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
      className={`a2-choice px-4 py-3 ${hasFootActions ? 'pb-10' : ''} ${selectable ? '' : 'cursor-default'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-micro font-semibold uppercase text-ink2">
            {fw.accreditor} · {fw.version}
            {/* Accreditor-recognition badges (NCPSA / ICAISA) — quiet chips,
                nothing at all for the (many) frameworks with none. */}
            <RecognitionChips recognitions={fw.recognitions} />
          </p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-ink">{fw.name}</p>
          <p className="mt-1 text-small tabular-nums text-ink2">
            {fw.standardCount} standards
            {fw.assuranceCount ? ` · ${fw.assuranceCount} assurances` : ''}
            {fw.indexMax ? ` · index ${fw.indexMin}–${fw.indexMax}` : ''}
          </p>
          {fw.adopted ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Pill variant="status" tone="good" className="tabular-nums">
                {`Adopted · ${fw.adoptedCount}`}
              </Pill>
              {/* WS2 — quiet, never blocking: the register keeps working exactly as
                  it always did; this is an offer, not a nag. */}
              {fw.supersededBy ? (
                <Pill variant="status" tone="watch" data-testid="superseded-badge">
                  Superseded — rev. {fw.supersededBy.version ?? fw.supersededBy.code} available
                </Pill>
              ) : null}
            </div>
          ) : null}
          {Array.isArray(fw.rubricLabels) && fw.rubricLabels.length ? (
            <p className="mt-1.5 text-[12px] text-ink2">Rubric: {fw.rubricLabels.join(' → ')}</p>
          ) : null}
          {/* WS1 — aliases as a DISCOVERY affordance: the same framework under
              every name a school might know it by. */}
          {Array.isArray(fw.aliases) && fw.aliases.length ? (
            <p data-testid="framework-aliases" className="mt-1.5 text-[12px] text-ink2">
              Also known as: {fw.aliases.join(' · ')}
            </p>
          ) : null}
          {/* The accreditor's own portal, when it has one (FCC → Accreditrac):
              the server's sentence verbatim — it says KYRO does not submit. */}
          {fw.evidencePlatform?.name ? (
            <p data-testid="framework-evidence-platform" className="mt-1.5 text-[12px] text-ink2">
              Evidence platform: {fw.evidencePlatform.name}
              {fw.evidencePlatform.line ? ` — ${fw.evidencePlatform.line}` : ''}
            </p>
          ) : null}
          {steerToUpgrade ? (
            <p className="a2-note mt-2" data-tone="watch">
              You hold the {steerToUpgrade.version} register — use Upgrade on it to move here with
              your scores and evidence carried over.
            </p>
          ) : null}
        </div>
        {selectable ? (
          <span aria-hidden className="a2-radio mt-0.5 shrink-0">
            {selected ? <Check size={11} strokeWidth={3} /> : null}
          </span>
        ) : null}
      </div>
    </button>
    <div className="absolute bottom-2 right-3 flex items-center gap-1">
      {/* The one-click path to the current edition — preflight first, always. */}
      {fw.adopted && fw.supersededBy && fw.upgrade?.available && onUpgrade ? (
        <Button
          size="sm"
          variant="quiet"
          data-testid={`framework-upgrade-${fw.code}`}
          onClick={() => onUpgrade(fw)}
          icon={<ArrowUpCircle size={13} />}
        >
          Upgrade
        </Button>
      ) : null}
      {/* Only for a framework you actually hold, and deliberately understated:
          this is the least-used control on the screen and the most destructive. */}
      {fw.adopted && onRemove ? (
        <Button size="sm" variant="quiet" onClick={() => onRemove(fw)}>
          Remove
        </Button>
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
function RemovePanel({ fw, impact, loading, error, busy, onCancel, onConfirm }) {
  const { losses, survives } = removalLines(impact)
  const costless = isCostless(impact)
  return (
    <div
      data-testid="framework-remove-confirm"
      className="panel panel-attention px-4 py-3.5 sm:col-span-2"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ink2" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">Remove {fw.name}?</p>

          {loading ? (
            <p className="mt-1.5 text-small text-ink2">Counting what this would remove…</p>
          ) : error ? (
            <p className="a2-note mt-1.5" data-tone="risk">{error}</p>
          ) : (
            <>
              <ul className="mt-1.5 space-y-0.5 text-small tabular-nums text-ink">
                {losses.map((l) => (
                  <li key={l}>· {l}</li>
                ))}
              </ul>
              {/* An untouched framework is a tidy-up, not a loss — say so rather
                  than alarming somebody who adopted it by accident a minute ago. */}
              {costless ? (
                <p className="mt-1.5 text-small text-ink2">
                  You haven’t scored or evidenced anything against this framework yet.
                </p>
              ) : null}
              {survives.map((line) => (
                <p key={line} className="mt-1.5 text-small text-ink2">
                  {line}
                </p>
              ))}
            </>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
              Keep it
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="framework-remove-confirm-btn"
              onClick={onConfirm}
              disabled={busy || loading || !!error}
              icon={<Trash2 size={13} />}
            >
              {busy ? 'Removing…' : 'Remove framework'}
            </Button>
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
function UpgradePanel({ fw, impact, loading, error, busy, onCancel, onConfirm }) {
  const { carried, notes } = upgradeLines(impact)
  const blockers = upgradeBlockers(impact)
  const toName = impact?.to?.name ?? fw.supersededBy?.name ?? 'the newer edition'
  return (
    <div
      data-testid="framework-upgrade-confirm"
      className="panel panel-attention panel-watch px-4 py-3.5 sm:col-span-2"
    >
      <div className="flex items-start gap-2.5">
        <ArrowUpCircle size={16} className="mt-0.5 shrink-0 text-ink2" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">
            Upgrade {fw.name} to {toName}?
          </p>

          {loading ? (
            <p className="mt-1.5 text-small text-ink2">Counting what carries over…</p>
          ) : error ? (
            <p className="a2-note mt-1.5" data-tone="risk">{error}</p>
          ) : (
            <>
              <ul className="mt-1.5 space-y-0.5 text-small tabular-nums text-ink">
                {carried.map((l) => (
                  <li key={l}>· {l}</li>
                ))}
              </ul>
              {notes.map((line) => (
                <p key={line} className="mt-1.5 text-small text-ink2">
                  {line}
                </p>
              ))}
              {blockers.map((line) => (
                <p key={line} className="a2-note mt-2" data-tone="risk">
                  <AlertTriangle size={13} aria-hidden />
                  <span>{line}</span>
                </p>
              ))}
            </>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
              Not now
            </Button>
            <Button
              variant="primary"
              size="sm"
              data-testid="framework-upgrade-confirm-btn"
              onClick={onConfirm}
              disabled={busy || loading || !!error || blockers.length > 0}
            >
              {busy ? 'Upgrading…' : 'Upgrade — everything carries over'}
            </Button>
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
        <p className="text-small text-ink2 sm:col-span-2">
          Loading frameworks…
        </p>
      ) : list.length === 0 ? (
        <p className="text-small text-ink2 sm:col-span-2">
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
              />
            ),
          )}
        </div>
      )}

      {/* F1 — ONE optional field, not a wizard step: the date that anchors the
          accreditation journey, offered at the moment of adoption because that is
          when a school is thinking about its accreditor. Skippable forever —
          the Journey tab's setup card asks the same question later. */}
      {!loading && list.length > 0 ? (
        <Field
          label="Last review date (if you have one)"
          span={2}
          reduce={reduce}
          hint="Optional — anchors your accreditation journey (cycle countdown, milestones). You can set it any time on the Journey tab."
        >
          <DatePicker
            value={lastReviewDate}
            onChange={setLastReviewDate}
            aria-label="Last review date (optional)"
            className={fieldInput}
          />
        </Field>
      ) : null}
    </EntityFormModal>
  )
}
