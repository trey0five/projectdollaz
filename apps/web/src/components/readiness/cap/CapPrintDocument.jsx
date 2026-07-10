// ─────────────────────────────────────────────────────────────────────────────
// Clean, print-friendly Corrective Action Plan document. Rendered on the dedicated
// /readiness/cap/print route; legible in print (black-on-white, scoped under the
// `cap-print` class so it never collides with the report print block). Carries the
// readiness DISCLAIMER — the CAP is a draft aid, NOT the official submission.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', complete: 'Complete' }
const SEV_LABEL = { material: 'Material', reportable: 'Reportable' }

function field(label, value, fallback) {
  return (
    <div className="cap-print-field">
      <div className="cap-print-field-label">{label}</div>
      <div className="cap-print-field-value">
        {value && String(value).trim() ? value : <span className="cap-print-muted">{fallback}</span>}
      </div>
    </div>
  )
}

export default function CapPrintDocument({ schoolName, periodLabel, rulesetVersion, statuteYear, entries }) {
  const live = (entries ?? []).filter((e) => !e.isResolved)
  const generated = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="ui-v1 cap-print">
      <header className="cap-print-header">
        <h1>Corrective Action Plan</h1>
        <div className="cap-print-meta">
          <div>
            <strong>{schoolName || 'School'}</strong>
            {periodLabel ? ` · ${periodLabel}` : ''}
          </div>
          <div className="cap-print-muted">
            Florida scholarship AUP readiness · ruleset {rulesetVersion} (statute {statuteYear}) ·
            generated {generated}
          </div>
        </div>
      </header>

      <section className="cap-print-disclaimer">
        <strong>Readiness pre-flag — not the official AUP.</strong> This draft Corrective
        Action Plan mirrors the Step Up For Students AUP template and the governing Florida
        statutes so you can prepare before your CPA engagement. It is <em>not</em> the official
        Agreed-Upon-Procedures report and <em>not</em> legal or audit advice, and it is a
        working draft — not the official submission to the funding organization or the DOE.
      </section>

      {live.length === 0 ? (
        <p className="cap-print-empty">
          No material or reportable exceptions were flagged for this period.
        </p>
      ) : (
        live.map((e, i) => (
          <article key={e.ruleId} className="cap-print-entry">
            <div className="cap-print-entry-head">
              <span className="cap-print-num">{i + 1}</span>
              <h2>{e.title}</h2>
              <span className={`cap-print-sev cap-print-sev-${e.severity}`}>
                {SEV_LABEL[e.severity] ?? e.severity}
              </span>
              <span className="cap-print-cite">{e.citation}</span>
            </div>
            {field('Observation', e.observation, '—')}
            {field('Root cause', e.rootCause, e.suggestedRootCause)}
            {field('Corrective action', e.correctiveAction, e.suggestedCorrectiveAction)}
            <div className="cap-print-row">
              {field('Responsible party', e.responsibleParty, e.suggestedResponsibleParty)}
              {field('Target date', e.targetDate, e.suggestedTimeframe)}
              {field('Status', STATUS_LABEL[e.status] ?? e.status, '—')}
            </div>
          </article>
        ))
      )}
    </div>
  )
}
