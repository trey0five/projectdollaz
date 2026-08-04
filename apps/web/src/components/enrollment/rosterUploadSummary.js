// ─────────────────────────────────────────────────────────────────────────────
// summarizeRosterUpload — turn the roster-upload response into the two SEPARATE
// sentences the panel is allowed to say.
//
// Why this is a module and not inline JSX. A roster upload now does two
// independent things: it saves student records, and it (maybe) writes this
// period's enrollment. The production report we are fixing was one sentence
// covering both — "Imported 436 students" — where only the count had happened.
// The rule that prevents a repeat is: every claim on this panel is derived from
// a field the SERVER actually sent, and a field the server did not send produces
// no claim at all. That rule is testable here and unfalsifiable inside a JSX
// ternary, which is the whole reason it lives in its own file.
//
// Input is the §4 RosterUploadResult:
//   { snapshot, promoted, superseded?, supersededManual?, warnings, reason?,
//     records: {created,updated,deleted,total} | null, recordsNote: string|null,
//     enrollment: {value, source, fiscalPeriodId, periodLabel} | null }
//
// The REVIEWED importer feeds the same shape (built from its commit result), so
// both cards say the two sentences the same way. Pure: no React, no I/O, no Date.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n) => Number(n).toLocaleString('en-US')

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

/** The fallback for "nothing was written". DELIBERATELY NAMES NO CAUSE.
 *
 *  The build contract said this branch means "an SIS connection owns this
 *  number". It does not: EnrollmentService.promote() has exactly one refusal —
 *  the manual-entry guard — and an explicit upload now passes supersedeManual,
 *  so no refusal reaches here today. Printing a confident "your SIS owns this"
 *  would be a fabricated explanation for a state we cannot diagnose from the
 *  response, which is the same class of error as the report we are fixing. So
 *  the fallback says what IS known and where to look; a server-supplied `reason`
 *  always wins, so a future refusal can explain itself without a web deploy. */
const NO_CAUSE_KNOWN =
  'The file and its grade breakdown were saved, so nothing is lost. Open the Enrollment overview to see the number in force, or set it there.'

export function summarizeRosterUpload(result) {
  const r = result ?? {}

  // ── Records: a count is claimed only when the server sent one ──────────────
  const raw = r.records && typeof r.records === 'object' ? r.records : null
  const records = raw
    ? {
        created: num(raw.created) ?? 0,
        updated: num(raw.updated) ?? 0,
        deleted: num(raw.deleted) ?? 0,
        total: num(raw.total) ?? 0,
      }
    : null

  let recordsLine
  if (!records) {
    // Counts-only file, or above the import ceiling — either way the server
    // created nothing, so this sentence must contain no number to misread. WHY it
    // created none comes from the server as `recordsNote`; the panel used to
    // infer it from whether any warning existed, and pointed at grade-code notes.
    recordsLine = 'Nothing was added to Records from this file.'
  } else if (records.created === 0 && records.deleted === 0) {
    // Acceptance 3, as the user experiences it: THE SAME FILE TWICE.
    //
    // The branch this replaces required created/updated/deleted to be all-zero,
    // which the API cannot emit: importCommit counts a matched row as `updated`
    // whether or not any field moved, so a genuine re-upload returns
    // {created:0, updated:436} and the panel said "0 added" — the exact reading
    // this branch exists to prevent, while its guard sat green on a hand-fed
    // payload. Matched-and-nothing-new IS the no-change outcome, so key on the
    // two counts that mean something arrived or left, and claim only that.
    recordsLine = `Nothing new — every row matched one of the ${fmt(
      records.total,
    )} students already on the roster.`
  } else {
    const parts = [`${fmt(records.created)} added`]
    if (records.updated > 0) parts.push(`${fmt(records.updated)} updated`)
    if (records.deleted > 0) parts.push(`${fmt(records.deleted)} removed`)
    recordsLine = `Student records saved — ${parts.join(', ')}. ${fmt(
      records.total,
    )} students on the roster now.`
  }

  // ── Enrollment: exactly one of three mutually exclusive branches ───────────
  const enr = r.enrollment && typeof r.enrollment === 'object' ? r.enrollment : null
  const value = num(enr?.value)
  const previous = num(r.supersededManual)
  // `promoted` is the server's word for "this call wrote period enrollment".
  // Without a value we cannot name what was written, so we do not claim it.
  const didPromote = r.promoted === true && value !== null
  const didSupersede = didPromote && r.superseded === true && previous !== null

  // WHICH period was written. A June file uploaded in August promotes into the
  // year it describes, not the year on the user's screen — so "this period" is
  // the one phrase this sentence may not use when the server named the year.
  const periodLabel =
    typeof enr?.periodLabel === 'string' && enr.periodLabel.trim() ? enr.periodLabel.trim() : null
  const forPeriod = periodLabel ? `Enrollment for ${periodLabel}` : 'This period’s enrollment'

  let branch = 'unchanged'
  let line = periodLabel
    ? `Enrollment for ${periodLabel} was left as it is.`
    : 'Enrollment for this period was left as it is.'
  let reason = null
  if (didSupersede) {
    branch = 'superseded'
    line = `Replaced your entered enrollment of ${fmt(previous)} with ${fmt(value)} from this file${
      periodLabel ? ` — ${periodLabel}` : ''
    }.`
  } else if (didPromote) {
    branch = 'promoted'
    line = `${forPeriod} is now ${fmt(value)}.`
  } else {
    reason = typeof r.reason === 'string' && r.reason.trim() ? r.reason.trim() : NO_CAUSE_KNOWN
  }

  // Shown INSTEAD of the lead line once the undo succeeds: leaving "Replaced your
  // entered enrollment of 430 with 436" above "Restored — back to 430" prints two
  // contradictory sentences, the false one in the more prominent style.
  const restoredLine = didSupersede
    ? `Your entered enrollment of ${fmt(previous)} is back in force${
        periodLabel ? ` for ${periodLabel}` : ''
      } — this file’s ${fmt(value)} was not kept.`
    : null

  const fileTotal = num(r.snapshot?.totalEnrolled)
  const observedOn = typeof r.snapshot?.observedOn === 'string' ? r.snapshot.observedOn : null

  return {
    records,
    recordsLine,
    // Server-authored, and only meaningful when nothing was created.
    recordsNote:
      !records && typeof r.recordsNote === 'string' && r.recordsNote.trim()
        ? r.recordsNote.trim()
        : null,
    enrollment: {
      branch,
      line,
      restoredLine,
      periodLabel,
      // Passed through EXPLICITLY. The panel's guard reads
      // summary.enrollment.periodHasFinancials; if this line is missing the value
      // is undefined, `=== false` is never true, and the warning silently never
      // renders — which is exactly how the first two attempts at this guard failed.
      // `!== false` rather than a truthy coerce: only an explicit server `false`
      // means "no financials", so an older server that omits the field stays quiet.
      periodHasFinancials: enr?.periodHasFinancials !== false,
      reason,
      value: didPromote ? value : null,
      previous: didSupersede ? previous : null,
      // The undo needs a period to restore into; without one the button would
      // 400, so it is not offered.
      restorePeriodId: didSupersede ? (enr?.fiscalPeriodId ?? null) : null,
    },
    file: {
      totalEnrolled: fileTotal,
      observedOn,
      line:
        fileTotal === null
          ? null
          : `This file listed ${fmt(fileTotal)} students${observedOn ? ` as of ${observedOn}` : ''}.`,
    },
  }
}

export default summarizeRosterUpload
