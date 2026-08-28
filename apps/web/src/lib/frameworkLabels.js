// ─────────────────────────────────────────────────────────────────────────────
// Naming and labelling frameworks, for a school that holds MORE THAN ONE.
//
// Dual accreditation is ordinary — FCIS beside Cognia in Florida, ACSI beside
// Cognia, the WCEA/WASC joint protocol — and the register has always been able to
// carry both frameworks' standards side by side. What it could not do was read
// them side by side: every scored surface resolved a single framework by
// dominance (most linked standards) and the rest of the register quietly fell out
// of the number, its rows rendering their 1–4 rubric as bare pips because the one
// set of labels on the page belonged to the other accreditor.
//
// PURE, and separated from the page for exactly that reason: "which labels does
// this row get" is the rule the bug lived in, and a rule worth a test is worth
// somewhere to put the test.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A pill-sized name for a framework. The catalog's `name` is a sentence — "the
 * Cognia Performance Standards" — which reads well in a paragraph and not at all
 * in a 40px control, so the pill uses the accreditor's initialism from the code
 * and the full name stays on the control's title attribute.
 *
 * The trailing year goes: the switcher is choosing an ACCREDITOR, not an edition,
 * and "MSA CESS 2022" beside "COGNIA 2022" spends its width on the half that is
 * the same for both.
 */
export function frameworkPillLabel(f) {
  const code = f?.code
  if (!code) return f?.name ?? 'Framework'
  return code
    .replace(/_(19|20)\d{2}$/, '')
    .replace(/_/g, ' ')
    .toUpperCase()
}

/**
 * Pill labels for a SET of frameworks — the collision fix.
 *
 * Stripping the edition year is right for the ordinary case (an accreditor, not
 * a revision) and wrong for exactly one: a school holding BOTH Cognia editions
 * mid-upgrade would see two identical COGNIA pills naming two different
 * registers. So the year comes back ONLY on collision — "COGNIA 2022" beside
 * "COGNIA 2025" — and every non-colliding framework keeps its plain label. The
 * year is read off the code's own trailing `_2022`; a colliding framework whose
 * code carries no year keeps the bare label (there is nothing honest to append).
 *
 * @param frameworks the frameworks in the rendered set (any shape with id+code)
 * @returns Map<frameworkId, pillLabel>
 */
export function frameworkPillLabels(frameworks) {
  const rows = (frameworks ?? []).filter((f) => f?.id)
  const byLabel = new Map()
  for (const f of rows) {
    const label = frameworkPillLabel(f)
    byLabel.set(label, (byLabel.get(label) ?? 0) + 1)
  }
  const out = new Map()
  for (const f of rows) {
    const label = frameworkPillLabel(f)
    if ((byLabel.get(label) ?? 0) > 1) {
      const year = /_((?:19|20)\d{2})$/.exec(f.code ?? '')?.[1] ?? null
      out.set(f.id, year ? `${label} ${year}` : label)
    } else {
      out.set(f.id, label)
    }
  }
  return out
}

/**
 * frameworkId → that framework's own 1–4 rubric labels.
 *
 * @param frameworks         the catalog list (may be null — not yet fetched)
 * @param readinessFramework readiness.framework — the one being READ. Authoritative
 *                           and present before the catalog arrives, so it is
 *                           written LAST and wins.
 */
export function buildRubricLabelsByFrameworkId(frameworks, readinessFramework) {
  const map = new Map()
  for (const f of frameworks ?? []) {
    if (f?.id && Array.isArray(f.rubricLabels) && f.rubricLabels.length > 0) {
      map.set(f.id, f.rubricLabels)
    }
  }
  const readId = readinessFramework?.id
  const readLabels = readinessFramework?.rubricLabels
  if (readId && Array.isArray(readLabels) && readLabels.length > 0) {
    map.set(readId, readLabels)
  }
  return map
}

/**
 * The labels ONE register row should show.
 *
 * A row linked to a framework gets THAT framework's labels — never the read
 * framework's, which is how a school holding two accreditations used to see half
 * its register score against the wrong accreditor's vocabulary. A hand-made row
 * carries no framework link at all and falls back to the read framework's labels,
 * exactly as it always did.
 *
 * Null is a legitimate answer: it means "no labels available", and the picker
 * renders bare pips rather than borrowing somebody else's words.
 */
export function labelsForStandard(standard, labelsByFrameworkId, fallbackLabels) {
  if (!standard?.frameworkId) return fallbackLabels ?? null
  return labelsByFrameworkId?.get(standard.frameworkId) ?? null
}
