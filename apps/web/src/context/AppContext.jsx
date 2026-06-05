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
import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  generateReports,
  validateDataset,
  findUnmapped,
} from '@finrep/engine'
import { ingest, classifyRole, resolveRoles, inferPeriod } from '@finrep/ingestion'
import { formatDate, formatShortDate, PERIOD_LABELS } from '../lib/format.js'

const AppContext = createContext(null)

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

export function AppProvider({ children, school = null }) {
  // `school` is the SELECTED school (from SchoolContext) — it carries the engine
  // begin-balance fields. The old PIN login is gone; auth is handled upstream.
  const [files, setFiles] = useState([]) // ordered FileEntry[]
  const [periodType, setPeriodType] = useState('ytd')
  const [periodDate, setPeriodDate] = useState('')
  const [periodTouched, setPeriodTouched] = useState(false)
  const [intakeExpanded, setIntakeExpanded] = useState(true)
  const [status, setStatus] = useState('')
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
    autoCollapsedRef.current = false
  }, [])

  const schoolId = school?.id ?? null
  useEffect(() => {
    // Reset when the active school changes (including first selection / clear).
    resetIntake()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId])

  // ── Smart-intake file loading (event handler, not an effect) ───
  // Each dropped/browsed file: insert a 'parsing' entry immediately, then
  // ingest -> validate -> classify, and replace it with a 'ready'/'error'
  // entry. Files resolve independently and concurrently.
  const loadFiles = useCallback(
    (fileList) => {
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

          const entry = {
            id,
            fileName: file.name,
            fileSize: file.size,
            status: 'ready',
            rows,
            metadata,
            suggestion,
            role: suggestion.role,
            roleConfirmed: false,
            balance,
            unmappedCount,
          }

          setFiles((prev) => prev.map((f) => (f.id === id ? entry : f)))

          // CY date auto-fill — done HERE in the handler (not an effect) so
          // it never fights the lint rule. Only seeds while the user hasn't
          // edited the date, and only from a confident CY classification.
          if (
            suggestion.role === 'cy' &&
            suggestion.confidence >= 0.6 &&
            metadata?.periodEndDate
          ) {
            const inferred = inferPeriod(metadata)
            setPeriodDate((cur) => {
              if (periodTouched) return cur
              return inferred.periodEndDate || cur
            })
            setPeriodType((cur) => (periodTouched ? cur : inferred.periodType))
          }

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
    [periodTouched]
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

  const byRole = useMemo(() => {
    const find = (id) => files.find((f) => f.id === id) || null
    return { cy: find(slots.cy), py: find(slots.py), audit: find(slots.audit) }
  }, [files, slots])

  const cyCollision = useMemo(
    () => conflicts.some((c) => c.kind === 'duplicate' && c.role === 'cy'),
    [conflicts]
  )

  const canGenerate = useMemo(
    () => !!byRole.cy && byRole.cy.status === 'ready' && !!periodDate && !cyCollision,
    [byRole, periodDate, cyCollision]
  )

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
        school,
      })
    } catch {
      return null
    }
  }, [byRole, school, canGenerate])

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

  const dateLabel = useMemo(() => formatDate(periodDate), [periodDate])
  const shortDateLabel = useMemo(() => formatShortDate(periodDate), [periodDate])
  const periodLabel = PERIOD_LABELS[periodType]

  const value = {
    school,
    files,
    byRole,
    conflicts,
    cyCollision,
    intakeMode,
    intakeExpanded,
    periodType,
    setPeriodType: onSetPeriodType,
    periodDate,
    setPeriodDate: onSetPeriodDate,
    periodTouched,
    dateLabel,
    shortDateLabel,
    periodLabel,
    status,
    setStatus,
    reports,
    canGenerate,
    resetIntake,
    loadFiles,
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
