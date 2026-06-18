// ─────────────────────────────────────────────────────────────
// Global application state (auth + smart-intake files + LIVE reports).
//
// The smart-intake redesign replaces the three fixed cy/py/audit dataset
// slots with an ordered `files[]` list. Each file is parsed once (in the
// loadFiles EVENT HANDLER — never an effect), classified, and per-file
// validated. Role slots, conflicts, canGenerate and the report bundle are
// ALL derived with useMemo over generateReports() — no results-in-state,
// no setState-in-effect. This gives a live preview and stays clean under
// the repo's react-hooks lint rule. The engine remains pure/untouched.
// ─────────────────────────────────────────────────────────────
import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'
import {
  generateReports,
  validateDataset,
  findUnmapped,
  deriveOpeningNetAssets,
} from '@finrep/engine'
import { ingest, classifyRole, resolveRoles, inferPeriod } from '@finrep/ingestion'
import { formatDate, formatShortDate, PERIOD_LABELS } from '../lib/format.js'
import { usePersistence } from './PersistenceContext.jsx'

const AppContext = createContext(null)

// Which SchoolConfig opening-balance field each uploaded role supplies.
const OPENING_FIELD_BY_ROLE = {
  cy: 'netAssetsBegin',
  py: 'pyNetAssetsBegin',
  audit: 'auditNetAssetsBegin',
}

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `f_${Date.now()}_${Math.random().toString(36).slice(2)}`

function readBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.onload = (e) => resolve(e.target.result)
    reader.readAsArrayBuffer(file)
  })
}

export function AppProvider({
  children,
  school = null,
  // Phase 1C: hydration seed. AppProvider is remounted (via a key including the
  // hydration token) whenever a hydrate completes, so these are consumed once at
  // mount through lazy useState init — never injected via an effect.
  initialFiles = [],
  initialPeriod = null,
  readOnly = false,
}) {
  // `school` is the SELECTED school (from SchoolContext) — it carries the engine
  // begin-balance fields. The old PIN login is gone; auth is handled upstream.
  const persistence = usePersistence()
  const [files, setFiles] = useState(() => initialFiles) // ordered FileEntry[]
  // Seed the period from the hydrated period when present; otherwise default. The
  // user-entered value still wins once periodTouched flips.
  const [periodType, setPeriodType] = useState(() => initialPeriod?.periodType || 'ytd')
  const [periodDate, setPeriodDate] = useState(() => initialPeriod?.periodEndDate || '')
  const [periodTouched, setPeriodTouched] = useState(false)
  const [intakeExpanded, setIntakeExpanded] = useState(true)
  const [status, setStatus] = useState('')
  // Opening net-asset balances are DERIVED from the uploaded trial balances
  // (deriveOpeningNetAssets) rather than typed at school creation. A user may
  // override a derived value; overrides are keyed by role ('cy'|'py'|'audit').
  const [openingOverrides, setOpeningOverrides] = useState({})
  // Auto-collapse the intake panel once exactly: the first time a valid,
  // conflict-free setup exists. After that, expand/collapse is user-driven
  // (this ref keeps us from fighting a manual re-expand on every recompute).
  const autoCollapsedRef = useRef(false)

  // ── Intake reset ───────────────────────────────────────
  // Clearing intake state is exposed (used when switching schools) and run
  // automatically whenever the selected school changes, so one school's
  // uploads never leak into another's report preview.
  const resetIntake = useCallback(() => {
    setFiles([])
    setStatus('')
    setPeriodDate('')
    setPeriodType('ytd')
    setPeriodTouched(false)
    setIntakeExpanded(true)
    setOpeningOverrides({})
    autoCollapsedRef.current = false
  }, [])

  // NOTE: the old schoolId-change reset effect is gone. AppProvider is remounted
  // (AuthedShell keys it by `${schoolId}:${hydrationToken}`) on every school
  // switch AND every completed hydrate, so intake state can't leak across
  // schools and the hydrated seed is never clobbered by a reset.

  // ── Smart-intake file loading (event handler, not an effect) ───
  // Each dropped/browsed file: insert a 'parsing' entry immediately, then
  // ingest -> validate -> classify, and replace it with a 'ready'/'error'
  // entry. Files resolve independently and concurrently.
  const loadFiles = useCallback(
    (fileList, forcedRole = null) => {
      const list = Array.from(fileList || [])
      if (!list.length) return
      setStatus(`Reading ${list.length} file${list.length > 1 ? 's' : ''}…`)
      setIntakeExpanded(true)

      list.forEach(async (file) => {
        const id = uid()
        setFiles((prev) => [
          ...prev,
          { id, fileName: file.name, fileSize: file.size, status: 'parsing' },
        ])

        try {
          const bytes = await readBytes(file)
          const { rows, metadata } = ingest(file.name, bytes)
          const suggestion = classifyRole({ fileName: file.name, metadata })
          const balance = validateDataset(rows)
          const unmappedCount = findUnmapped(rows).length

          // When a file is dropped/browsed INTO a specific empty slot, honor
          // that intent: stamp the slot's role as a confirmed override instead
          // of using the auto-classification. The classification ALGORITHM is
          // untouched — we just pin the resolved role for this entry.
          const entry = {
            id,
            fileName: file.name,
            fileSize: file.size,
            status: 'ready',
            rows,
            metadata,
            suggestion,
            role: forcedRole ?? suggestion.role,
            roleConfirmed: forcedRole != null,
            balance,
            unmappedCount,
          }

          setFiles((prev) => prev.map((f) => (f.id === id ? entry : f)))

          // NOTE: the period date/type are NO LONGER stamped here. They are
          // PURELY DERIVED from whichever file ends up occupying the CY slot
          // (see effectivePeriodDate/effectivePeriodType below) until the user
          // edits them. Stamping at load time fought that derivation and could
          // not see the FINAL slot assignment, so it is removed.

          setStatus(
            `✓ ${file.name} — ${rows.length} accounts (${suggestion.role.toUpperCase()})`
          )
        } catch (err) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === id
                ? { id, fileName: file.name, fileSize: file.size, status: 'error', error: err.message }
                : f
            )
          )
          setStatus(`⚠ ${file.name}: ${err.message}`)
        }
      })
    },
    []
  )

  // Load files PINNED to a specific role (drop/browse into an empty slot).
  const loadFilesForRole = useCallback(
    (role, fileList) => loadFiles(fileList, role),
    [loadFiles]
  )

  const setFileRole = useCallback((id, role) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, role, roleConfirmed: true } : f))
    )
  }, [])

  const removeFile = useCallback((id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const onSetPeriodDate = useCallback((d) => {
    setPeriodTouched(true)
    setPeriodDate(d)
  }, [])

  const onSetPeriodType = useCallback((t) => {
    setPeriodTouched(true)
    setPeriodType(t)
  }, [])

  const expand = useCallback(() => setIntakeExpanded(true), [])
  const collapse = useCallback(() => setIntakeExpanded(false), [])

  // ── Derived: role resolution (pure, no effects) ─────────────
  const { slots, conflicts } = useMemo(() => {
    const ready = files.filter((f) => f.status === 'ready')
    return resolveRoles(
      ready.map((f) => ({
        id: f.id,
        role: f.role,
        fiscalYear: f.metadata?.fiscalYear,
        periodEndDate: f.metadata?.periodEndDate,
        periodEndSource: f.metadata?.periodEndSource,
        auditStatus: f.metadata?.auditStatus,
        confidence: f.suggestion?.confidence,
        override: f.roleConfirmed,
      }))
    )
  }, [files])

  // Resolved slots from uploaded files. History-derived comparatives are layered
  // on AFTER (uploadedByRole), so an explicit upload ALWAYS beats a history fill.
  const uploadedByRole = useMemo(() => {
    const find = (id) => files.find((f) => f.id === id) || null
    return { cy: find(slots.cy), py: find(slots.py), audit: find(slots.audit) }
  }, [files, slots])

  // AUTO-COMPARATIVES: when a CY is present but a PY/Audited slot is genuinely
  // empty, fall back to the history-derived entry ("from saved history"). The
  // engine consumes its rows exactly like an uploaded file's. A later upload into
  // the slot overrides automatically (uploadedByRole wins).
  const history = persistence.historyComparatives
  const byRole = useMemo(() => {
    const next = { ...uploadedByRole }
    if (next.cy) {
      if (!next.py && history.py) next.py = history.py
      if (!next.audit && history.audit) next.audit = history.audit
    }
    return next
  }, [uploadedByRole, history])

  const cyCollision = useMemo(
    () => conflicts.some((c) => c.kind === 'duplicate' && c.role === 'cy'),
    [conflicts]
  )

  // ── EFFECTIVE period date/type (pure derivation, source of truth) ──
  // Until the user touches the controls, the period date AND type are inferred
  // from the file that actually occupies the CY slot (byRole.cy) — NOT from a
  // load-time classification check. Once the user edits, their value wins. This
  // is a pure derivation (no setState-in-effect), so a CY-slot file that was
  // classified 'py' (and thus never triggered the old load-time auto-fill) now
  // still pre-fills the date, and the field shows the detected date.
  const inferredCy = useMemo(
    () => (byRole.cy?.metadata ? inferPeriod(byRole.cy.metadata) : null),
    [byRole]
  )

  const effectivePeriodDate = useMemo(
    () => (periodTouched ? periodDate : inferredCy?.periodEndDate || periodDate),
    [periodTouched, periodDate, inferredCy]
  )
  const effectivePeriodType = useMemo(
    () => (periodTouched ? periodType : inferredCy?.periodType || periodType),
    [periodTouched, periodType, inferredCy]
  )

  const canGenerate = useMemo(
    () =>
      !!byRole.cy && byRole.cy.status === 'ready' && !!effectivePeriodDate && !cyCollision,
    [byRole, effectivePeriodDate, cyCollision]
  )

  // ── Derived opening net assets ──────────────────────────────
  // Each uploaded TB yields its own opening via deriveOpeningNetAssets (the
  // imbalance for a management TB, or the equity row for a complete one). A
  // user override wins; otherwise the derived value is used. This replaces the
  // numbers that used to be hand-typed at school creation.
  const openings = useMemo(() => {
    const out = {}
    for (const role of ['cy', 'py', 'audit']) {
      const entry = byRole[role]
      if (!entry || !entry.rows?.length) {
        out[role] = null
        continue
      }
      const derived = deriveOpeningNetAssets(entry.rows)
      const override = openingOverrides[role]
      const hasOverride = typeof override === 'number' && Number.isFinite(override)
      out[role] = {
        role,
        fileName: entry.fileName,
        derived,
        override: hasOverride ? override : null,
        effective: hasOverride ? override : derived.value,
      }
    }
    return out
  }, [byRole, openingOverrides])

  // The school config fed to the engine, with opening balances replaced by the
  // derived/overridden values (falling back to the stored value when a given
  // role hasn't been uploaded).
  const effectiveSchool = useMemo(() => {
    if (!school) return school
    const next = { ...school }
    for (const role of ['cy', 'py', 'audit']) {
      const o = openings[role]
      if (o) next[OPENING_FIELD_BY_ROLE[role]] = o.effective
    }
    return next
  }, [school, openings])

  const setOpening = useCallback((role, value) => {
    setOpeningOverrides((prev) => {
      const next = { ...prev }
      const n = Number(value)
      if (value === '' || value == null || Number.isNaN(n)) delete next[role]
      else next[role] = n
      return next
    })
  }, [])

  // ── SAVE (Phase 1C): persist the slotted, newly-uploaded imports + request the
  // canonical server snapshot. History-filled slots already exist as imports and
  // are NOT re-POSTed. The live useMemo preview stays the fast path; this is a
  // separate async action so the preview never blocks.
  const save = useCallback(async () => {
    if (readOnly) return null
    if (!byRole.cy || byRole.cy.status !== 'ready' || !effectivePeriodDate) return null
    const imports = []
    for (const role of ['cy', 'py', 'audit']) {
      const entry = byRole[role]
      if (!entry || entry.status !== 'ready') continue
      // Skip history-filled (already-persisted, foreign-period) slots.
      if (entry.fromHistory || entry.persisted) continue
      imports.push({
        role,
        sourceName: entry.fileName,
        rows: entry.rows,
        metadata: entry.metadata || {},
      })
    }
    if (imports.length === 0) return null
    return persistence.savePeriod({
      periodEndDate: effectivePeriodDate,
      periodType: effectivePeriodType,
      label: undefined,
      imports,
    })
  }, [readOnly, byRole, effectivePeriodDate, effectivePeriodType, persistence])

  // ── LIVE PREVIEW: reports derived over the pure engine ──────
  // `generatedAt` is intentionally OMITTED so re-renders never thrash a
  // clock value (the engine is deterministic; export stamps the clock).
  const reports = useMemo(() => {
    if (!canGenerate || !byRole.cy) return null
    try {
      return generateReports({
        cyData: byRole.cy.rows,
        pyData: byRole.py?.rows ?? [],
        auditData: byRole.audit?.rows ?? [],
        school: effectiveSchool,
      })
    } catch {
      return null
    }
  }, [byRole, effectiveSchool, canGenerate])

  // ── Intake mode (empty | review | collapsed) ────────────────
  const hasUnresolved = conflicts.length > 0

  // Auto-collapse ONCE on the first valid, conflict-free setup (spec point
  // 6: "once set up… collapses into a slim summary strip"). Done as a
  // render-time state transition (the pattern this repo already uses for
  // tab reset) — NOT a setState-in-effect — so it stays clean under the
  // react-hooks lint rule. Subsequent expand/collapse is fully user-driven.
  if (reports && !hasUnresolved && !autoCollapsedRef.current) {
    autoCollapsedRef.current = true
    if (intakeExpanded) setIntakeExpanded(false)
  }

  const intakeMode = useMemo(() => {
    if (files.length === 0) return 'empty'
    // Never auto-collapse while a conflict still needs the user.
    if (!intakeExpanded && reports && !hasUnresolved) return 'collapsed'
    return 'review'
  }, [files.length, intakeExpanded, reports, hasUnresolved])

  // Labels read the EFFECTIVE (inferred-until-touched) values so the rendered
  // statements match the date/type actually feeding canGenerate + the engine.
  const dateLabel = useMemo(() => formatDate(effectivePeriodDate), [effectivePeriodDate])
  const shortDateLabel = useMemo(
    () => formatShortDate(effectivePeriodDate),
    [effectivePeriodDate]
  )
  const periodLabel = PERIOD_LABELS[effectivePeriodType]

  // Dirty = at least one slotted, newly-uploaded (non-history) ready file exists
  // that hasn't been persisted yet. Drives the Save control's enabled state.
  const dirty = useMemo(
    () =>
      ['cy', 'py', 'audit'].some((role) => {
        const e = byRole[role]
        return e && e.status === 'ready' && !e.fromHistory && !e.persisted
      }),
    [byRole],
  )

  const value = {
    school,
    files,
    byRole,
    conflicts,
    cyCollision,
    intakeMode,
    readOnly,
    canEdit: !readOnly,
    // Persistence surface (Phase 1C).
    save,
    saveState: persistence.saveState,
    savedPeriodLabel: persistence.savedPeriodLabel,
    dirty,
    intakeExpanded,
    // Expose the EFFECTIVE (inferred-until-touched) period as periodDate/Type so
    // the input SHOWS the detected date and everything downstream agrees. The
    // raw setters still flip periodTouched so a user edit takes over.
    periodType: effectivePeriodType,
    setPeriodType: onSetPeriodType,
    periodDate: effectivePeriodDate,
    setPeriodDate: onSetPeriodDate,
    periodTouched,
    dateLabel,
    shortDateLabel,
    periodLabel,
    status,
    setStatus,
    openings,
    setOpening,
    reports,
    canGenerate,
    resetIntake,
    loadFiles,
    loadFilesForRole,
    setFileRole,
    removeFile,
    expand,
    collapse,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within an AppProvider')
  return ctx
}

// ── Read-only report view (Phase 1C History) ─────────────────────────────────
// Feeds the SAME report components a STORED snapshot bundle instead of the live
// intake-derived `reports`. The four statement components only read
// { reports, school, dateLabel, periodLabel } from useApp(), so a minimal value
// suffices — no intake state, no engine recompute. readOnly flags the consumer.
export function ReportViewProvider({ children, bundle, school = null, dateLabel = '', periodLabel = '' }) {
  const value = useMemo(
    () => ({
      reports: bundle,
      school,
      dateLabel,
      periodLabel,
      readOnly: true,
      canEdit: false,
    }),
    [bundle, school, dateLabel, periodLabel],
  )
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
