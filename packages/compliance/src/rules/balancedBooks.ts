// §II Accounting System — the self-balancing system must produce a trial balance
// that balances. AUTO: reuses the engine's already-computed
// bundle.validation.balanced flag (passed in as financials.balanced). The engine
// proves this; we never recompute it.
import type { Rule } from '../types.js'

const CITE = 'SUFS AUP §II (Accounting System)'

export const balancedBooks: Rule = {
  id: 'balanced_books',
  section: 'II',
  title: 'Trial balance balances (self-balancing system)',
  citation: CITE,
  severityOnFail: 'reportable',
  kind: 'auto',
  programs: 'all',
  evaluate(facts) {
    const { hasSnapshot, balanced } = facts.financials
    if (!hasSnapshot) {
      return {
        status: 'needs_data',
        detail: 'No saved statement snapshot for this period yet — generate and save one to evaluate the trial balance.',
        citation: CITE,
      }
    }
    if (balanced) {
      return {
        status: 'pass',
        detail: 'The trial balance balances — debits equal credits, consistent with a self-balancing accounting system.',
        citation: CITE,
      }
    }
    return {
      status: 'reportable',
      detail: 'The trial balance does not balance. A self-balancing system that produces a balanced TB is required; this is a reportable exception.',
      citation: CITE,
    }
  },
}
