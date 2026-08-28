// ─────────────────────────────────────────────────────────────────────────────
// ExplainerDrawer — F3 THE STANDARD EXPLAINER: one standard's whole story for a
// committee member who has never read an accreditation manual. The "What this
// means" half of the expanded row's two-tab flip (Evidence | What this means).
//
// Renders ONE server payload (GET …/standards/:id/explainer) verbatim:
//   · the statement is the catalog's exact text, quoted;
//   · `plainLanguage` renders ONLY when the server authored it — null means the
//     translation has not been written for this framework and the drawer shows
//     NOTHING invented (no lorem, no paraphrase; suppression honesty applies to
//     prose too);
//   · the evidence checklist's `whereItLives` / `window` / `state` strings are
//     server-authored so Penny and print can reuse the same words;
//   · the rubric position comes from the payload's own `rubric[].current`.
//
// Lazily fetched on mount, exactly like EvidencePanel loads its evidence —
// the drawer appears only when the flip is opened, so the register list pays
// nothing for it.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { Activity, Check, Minus, X } from 'lucide-react'
import SuggestionsStrip from './SuggestionsStrip.jsx'

// The checklist's closed state vocabulary → display words (fallback: the key,
// humanized — never a guessed state).
const CHECK_STATE = {
  missing: 'Missing',
  attached_current: 'Attached · current',
  attached_stale: 'Attached · stale',
  attached_expiring: 'Attached · expiring',
  attached_unknown: 'Attached · date unknown',
  attached: 'Attached',
  not_tracked: 'Not tracked',
}
const stateWord = (s) => CHECK_STATE[s] ?? String(s ?? '').replace(/_/g, ' ')

function ChecklistRow({ item }) {
  const missing = item.state === 'missing'
  // B6 — the icon must MATCH the state word for EVERY state: a green check only
  // for the attached states, the amber X only for missing, and a neutral dash
  // for not_tracked / anything unknown. A green check beside "Not tracked"
  // asserted evidence that was never collected.
  const attached = typeof item.state === 'string' && item.state.startsWith('attached')
  const Icon = missing ? X : attached ? Check : Minus
  return (
    <li className="flex flex-wrap items-start gap-2 rounded-lg border border-white/10 bg-navy/50 px-3 py-2">
      <span
        data-testid={`check-icon-${attached ? 'attached' : missing ? 'missing' : 'neutral'}`}
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          missing
            ? 'border-[#F59E0B]/50 bg-[#F59E0B]/10 text-[#fde68a]'
            : attached
              ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
              : 'border-white/20 bg-white/5 text-white/50'
        }`}
        aria-hidden
      >
        <Icon size={12} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-white/85">{item.label}</span>
        <span className="block text-[11.5px] text-white/45">
          {[
            item.whereItLives,
            item.window,
            item.artifactCount > 0
              ? `${item.artifactCount} attached`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${
          missing
            ? 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#fde68a]'
            : 'border-white/15 bg-white/5 text-white/60'
        }`}
      >
        {stateWord(item.state)}
      </span>
    </li>
  )
}

export default function ExplainerDrawer({
  standardId,
  fetchExplainer, // async (standardId) => the explainer payload
  canEdit = false,
  onAttachSuggestion = null,
  onLinkPlan = null,
}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Lazy load on first mount (the flip was just opened) — EvidencePanel's own
  // microtask-defer + cancelled-flag pattern.
  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => fetchExplainer(standardId))
      .then((payload) => {
        if (!cancelled) setData(payload ?? null)
      })
      .catch(() => {
        if (!cancelled) setError('The explainer for this standard is unavailable right now.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standardId])

  // After an attach, the checklist's states are stale — re-read the payload so
  // the sentence that asked for the artifact is the one that says it arrived.
  const reload = useCallback(async () => {
    try {
      setData((await fetchExplainer(standardId)) ?? null)
    } catch {
      /* keep the stale drawer — the attach itself succeeded */
    }
  }, [fetchExplainer, standardId])
  const attachAndReload = onAttachSuggestion
    ? async (sug) => {
        await onAttachSuggestion(sug)
        await reload()
      }
    : null

  if (loading) {
    return <p className="text-[13px] text-white/50">Reading this standard&apos;s story…</p>
  }
  if (error || !data) {
    return <p className="text-[13px] text-white/50">{error || 'Nothing to explain yet.'}</p>
  }

  const rubric = data.rubric ?? []
  const current = rubric.find((r) => r.current) ?? null
  const checklist = data.evidenceChecklist ?? []
  const signals = data.signals ?? []

  return (
    <div className="space-y-4" data-testid="explainer-drawer">
      {/* header — code · key characteristic */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#fbbf24]/90">
        {data.code}
        {data.keyCharacteristic?.label ? ` · ${data.keyCharacteristic.label}` : ''}
      </p>

      {/* the statement, verbatim and quoted */}
      {data.statement ? (
        <blockquote className="border-l-2 border-[#F59E0B]/50 pl-3 text-[13.5px] italic leading-relaxed text-white/80">
          &ldquo;{data.statement}&rdquo;
        </blockquote>
      ) : null}

      {/* the authored translation — ONLY when the server wrote one. Null renders
          NOTHING: no placeholder, no paraphrase, no block at all. */}
      {data.plainLanguage ? (
        <p data-testid="explainer-plain" className="text-[14px] leading-relaxed text-white">
          {data.plainLanguage}
        </p>
      ) : null}

      {/* what good evidence looks like — live states, server words */}
      {checklist.length ? (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
            What good evidence looks like
          </p>
          <ul className="space-y-1.5">
            {checklist.map((item) => (
              <ChecklistRow key={item.tag ?? item.label} item={item} />
            ))}
          </ul>
        </div>
      ) : null}

      {/* your rubric position */}
      {rubric.length ? (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
            Your rubric position
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {rubric.map((r) => (
              <span
                key={r.score}
                aria-current={r.current ? 'true' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                  r.current
                    ? 'border-[#F59E0B] bg-[#F59E0B]/20 text-[#fde68a]'
                    : 'border-white/15 bg-white/5 text-white/50'
                }`}
              >
                {r.score} · {r.label}
              </span>
            ))}
            {current ? (
              <span className="text-[12px] text-white/55">&ldquo;{current.label}&rdquo; (self-scored)</span>
            ) : (
              <span className="text-[12px] text-white/45">Not yet self-scored</span>
            )}
          </div>
          {/* B4 — the accreditor's long-form descriptor for the CURRENT level,
              verbatim, as subtext under the pills. Only the level the school
              actually sits at (all four would drown the pills); null renders
              nothing — no descriptor is invented for frameworks without them. */}
          {current?.descriptor ? (
            <p
              data-testid="rubric-descriptor"
              className="mt-2 text-[12.5px] italic leading-relaxed text-white/60"
            >
              &ldquo;{current.descriptor}&rdquo;
            </p>
          ) : null}
        </div>
      ) : null}

      {/* the operating numbers bound to this standard */}
      {signals.length ? (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
            <Activity size={12} aria-hidden /> Bound signals
          </p>
          <div className="flex flex-wrap gap-1.5">
            {signals.map((s) => (
              <span
                key={s.key}
                className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11.5px] text-white/65"
              >
                {s.label}
                {/* B5 — unknown ≠ available: a null availability renders an
                    explicit "not checked", never the bare (available-looking)
                    chip. Only a verified 'available' earns silence. */}
                {s.availability == null ? (
                  <span className="ml-1 text-white/35">· not checked</span>
                ) : s.availability !== 'available' ? (
                  <span className="ml-1 text-white/35">· {String(s.availability).replace(/_/g, ' ')}</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* the same suggestion cards the Evidence flip offers, so "attach the
          survey it asks for" is one click from the sentence that asked */}
      {(data.suggestions ?? []).length ? (
        <SuggestionsStrip
          suggestions={data.suggestions}
          canEdit={canEdit && !!attachAndReload}
          onAttach={attachAndReload}
          onLinkPlan={onLinkPlan}
        />
      ) : null}
    </div>
  )
}
