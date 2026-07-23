// ─────────────────────────────────────────────────────────────────────────────
// flowSchema — the SEAM between the RecordFlow framework (recordwizard/*) and
// the per-module flow configs (recordFlows.jsx). Pure data contracts: no React,
// no styling. A FlowDef describes one "add records" experience — small friendly
// field steps, then a framework-appended Review step where the whole queued
// basket saves in one sequential batch. Configs contain NO hooks and NO JSX
// beyond lucide Icon references; loaders are plain promise factories that
// resolve to their FINAL value (call `.then((r) => r.data)` inside the config —
// api.js returns axios responses).
// ─────────────────────────────────────────────────────────────────────────────

/** The renderable field types. 'date' ALWAYS renders the shared DatePicker —
 *  never a native <input type="date">. */
export const FIELD_TYPES = ['text', 'textarea', 'select', 'number', 'date', 'checkbox']

// crypto.randomUUID needs a secure context; the counter fallback keeps queued
// item ids unique within a session either way (they never leave the client).
let idCounter = 0
export function makeItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  idCounter += 1
  return `rf-${Date.now().toString(36)}-${idCounter}`
}

/**
 * @typedef {Object} FlowDef
 * @property {string} key          'governance.policy' — unique across all flows
 * @property {string} noun         'policy'
 * @property {string} nounPlural   'policies'
 * @property {Function} Icon       lucide component (referenced, not rendered, by configs)
 * @property {Object<string, (ctx: Object) => Promise<*>>} [loaders]
 *   Fetched ONCE on mount via Promise.allSettled. Each fn RESOLVES TO THE FINAL
 *   VALUE. A rejected loader → data[dataKey] = null + loadErrors[dataKey] = true.
 * @property {(data: Object, ctx: Object) => (null | { title: string, body: string,
 *   action?: { label: string, goToOptionKey: string } })} [gate]
 *   Truthy → a teach panel replaces the whole flow (e.g. gift with no campaigns).
 * @property {Object} defaults     the page's EMPTY_* object verbatim; strings for
 *   text/number/date fields, booleans for checkboxes
 * @property {FlowStep[]} steps    field steps ONLY (≥1); the Review step is
 *   framework-appended, always last
 * @property {(values: Object, data: Object) => Object} toBody
 *   The EXACT whitelisted payload — built key-by-key, NEVER spread (the API's
 *   forbidNonWhitelisted ValidationPipe 400s any stray key).
 * @property {(ctx: Object, body: Object, values: Object) => Promise} submit
 *   The real api.js create call.
 * @property {(values: Object) => string} itemLabel
 *   Chip/row headline; the framework falls back to `Untitled ${noun}` when ''.
 * @property {(values: Object, data: Object) => string} [itemSub]
 *   Chip subline, e.g. 'policy · Financial'.
 * @property {(values: Object, data: Object) => Array<[string, string]>} reviewPairs
 *   Review-step summary rows ('—' for blanks), in step order.
 */

/**
 * @typedef {Object} FlowStep
 * @property {string} key
 * @property {string} label        rail word ('Basics')
 * @property {string} title        serif heading ('First, the basics')
 * @property {string} [blurb]
 * @property {boolean} [optional]  true → header sells skippability + a ghost
 *   "Skip details" link straight to Review
 * @property {FlowField[]} fields
 */

/**
 * @typedef {Object} FlowField
 * @property {string} key
 * @property {string} label
 * @property {string} type         one of FIELD_TYPES
 * @property {boolean} [required]
 * @property {string} [requiredMsg]  friendly override ('Give it a title')
 * @property {1|2} [span]          default 1 (2 = full row in the 2-col grid)
 * @property {string} [placeholder]
 * @property {string} [hint]
 * @property {number} [maxLength]
 * @property {number} [rows]       textarea rows
 * @property {number} [min]        numeric lower bound
 * @property {number} [max]        numeric upper bound
 * @property {boolean} [integer]   true → whole-number rule
 * @property {boolean} [money]     true → ≤2dp rule + a live '$ 12,500' echo
 *   under the field when valid & non-empty
 * @property {Array<{value: string, label: string}> | ((data: Object, values: Object)
 *   => Array<{value: string, label: string}>)} [options]  selects only
 * @property {string} [emptyOptionLabel]  select renders a value:'' first option
 * @property {string} [lookupKey]  names the loader feeding this select; on
 *   loadErrors[lookupKey] an OPTIONAL field renders a disabled select + a
 *   "leave this blank" note (required lookups must be handled by `gate`)
 * @property {(values: Object) => boolean} [showIf]  hidden fields are NOT
 *   validated and NOT rendered
 * @property {boolean} [fold]      trailing fold fields collapse into "More"
 * @property {(raw: *, values: Object) => (string | null)} [validate]
 *   Extra rule, runs after the built-ins.
 */
