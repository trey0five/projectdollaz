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
  deriveOpeningNetAssets,
  DEFAULT_CHART,
} from '@finrep/engine'
import {
  ingest,
  classifyRole,
  resolveRoles,
  inferPeriod,
  validateSyntheticRenumber,
  renumberSynthetic,
  statementSections,
} from '@finrep/ingestion'
import { formatDate, formatShortDate, PERIOD_LABELS } from '../lib/format.js'
import { importsApi, mappingApi } from '../lib/api.js'
import { getIntakeMemory, invalidateIntakeMemory } from '../lib/intakeMemory.js'
import { failureFromError, failureText } from '../lib/ingestFailure.js'
import {
  pairIntakeFiles,
  removeIntakeEntry,
  setRoleInRaw,
  memberHolding,
  memberIdsOf,
} from '../lib/statementPairing.js'
import { rememberBytes, withSessionBytes } from '../lib/sessionBytes.js'
import { autoMapEntries } from '../lib/sectionSuggest.js'
import { serverMappedAccts, reviewSummary } from '../lib/reviewQueue.js'
import { rememberPicks, sessionPicks } from '../lib/sessionPicks.js'
import { usePersistence } from './PersistenceContext.jsx'
import { asTableFile } from '../lib/pdfTable.js'

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

/**
 * One READY FileEntry from a parse result. Shared by the drop path and the
 * column picker so both produce exactly the same shape. `bytes` stays on the
 * entry for THIS tab only (the picker re-reads them); it is never part of a
 * save payload — save() sends rows + metadata.
 */
function buildReadyEntry({
  id,
  fileName,
  fileSize,
  bytes,
  result,
  role = null,
  roleConfirmed = false,
  roleFromSlot = false,
}) {
  const { rows, metadata, warnings } = result
  const suggestion = classifyRole({ fileName, metadata })
  return {
    id,
    fileName,
    fileSize,
    status: 'ready',
    rows,
    metadata,
    warnings: Array.isArray(warnings) ? warnings : [],
    bytes: bytes ?? null,
    suggestion,
    role: role ?? suggestion.role,
    roleConfirmed: !!roleConfirmed,
    // The role came from WHERE the file was dropped (an empty slot), not from a
    // person picking it — a statement half dropped next to its other half
    // follows that half (statementPairing mergedRole).
    roleFromSlot: !!(roleConfirmed && roleFromSlot),
    balance: validateDataset(rows),
    unmappedCount: findUnmapped(rows).length,
  }
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
  // When false, the intake never auto-collapses to the slim summary after a valid
  // setup — it stays in the 3-slot review so adding PY/Audited is obvious (used by
  // the Data hub modal, where the collapse-to-summary is confusing).
  autoCollapse = true,
  // When true, a valid trial balance persists itself automatically (debounced)
  // so the user never has to press Save. Opt-in (the Data hub modal sets it).
  autoSave = false,
}) {
  // `school` is the SELECTED school (from SchoolContext) — it carries the engine
  // begin-balance fields. The old PIN login is gone; auth is handled upstream.
  const persistence = usePersistence()
  // RAW uploads, in drop order. What the intake SHOWS (`files`) is derived from
  // these by pairIntakeFiles: a Profit and Loss half + its Balance Sheet half
  // become one merged entry (#40). Hydrated entries get this tab's bytes back
  // (sessionBytes) so "Change columns" survives the autosave remount.
  const [rawFiles, setRawFiles] = useState(() => withSessionBytes(school?.id, initialFiles))
  // "Combine anyway" pairs the person forced: [{ plId, bsId }] (either order).
  const [manualPairs, setManualPairs] = useState([])
  const files = useMemo(() => pairIntakeFiles(rawFiles, manualPairs), [rawFiles, manualPairs])
  // The ONE open column picker (#32), by intake id; null = closed.
  const [pickerFileId, setPickerFileId] = useState(null)
  // What KYRO remembers about this school's uploads (null = nothing / unavailable).
  const [intakeMemory, setIntakeMemory] = useState(null)
  // Seed the period from the hydrated period when present; otherwise default. The
  // user-entered value still wins once periodTouched flips.
  const [periodType, setPeriodType] = useState(() => initialPeriod?.periodType || 'ytd')
  const [periodDate, setPeriodDate] = useState(() => initialPeriod?.periodEndDate || '')
  const [periodTouched, setPeriodTouched] = useState(false)
  const [intakeExpanded, setIntakeExpanded] = useState(true)
  const [status, setStatus] = useState('')
  // PY AUTO-PROMOTE: when a Prior-Year file is uploaded alongside the CY, also
  // save it as its OWN saved period (role cy) so the year-over-year trend lights
  // up. Default ON; the user can opt out via the PromotePyToggle under the PY slot.
  const [promotePy, setPromotePy] = useState(true)
  // Opening net-asset balances are DERIVED from the uploaded trial balances
  // (deriveOpeningNetAssets) rather than typed at school creation. A user may
  // override a derived value; overrides are keyed by role ('cy'|'py'|'audit').
  const [openingOverrides, setOpeningOverrides] = useState({})
  // ── Category-mapping overlay (intake "assign a category" editor) ──────────
  // mappedOverlay holds THIS session's category picks for accounts the engine
  // flagged "N to review" (income-statement accounts missing from the chart).
  // It is merged on top of DEFAULT_CHART.mapping.entries to form activeChart,
  // which drives BOTH the live preview and the per-file unmapped detection so a
  // freshly-categorized account immediately drops out of review and shows up in
  // the statements. Keys are String(acct) to match the PATCH /mapping contract;
  // the engine reads entries[r.acct] with a numeric acct and string-coercion
  // makes the lookup equivalent. Mutated ONLY by the mapAccounts action and
  // resetIntake — never an effect.
  //
  // KNOWN LIMITATION (DEFERRED — do not solve here): GET /schools/:id/mapping
  // returns metadata only (no entries), so mappedOverlay starts EMPTY each
  // session and category picks persisted in a PRIOR session RE-FLAG on reload.
  // The saved server-side statements remain correct (each pick is PATCHed into
  // the canonical merged chart). The clean fix is an additive backend change
  // (GET returns entries) in the fenced apps/api/src/mapping/** owned by the
  // mapping agent — coordinate there rather than working around it here.
  //
  // Seeded from this TAB's confirmed picks (sessionPicks — only ever written
  // after PATCH /mapping succeeded), so an autosave remount doesn't re-flag
  // accounts the school sorted a second ago. After a reload the saved snapshot
  // covers them instead (serverMapped below).
  const [mappedOverlay, setMappedOverlay] = useState(() => sessionPicks(school?.id)) // { [String(acct)]: SCoaCategory } — THIS session's picks
  const [mappingAccts, setMappingAccts] = useState(() => new Set()) // String(acct) with PATCH in flight
  // Auto-collapse the intake panel once exactly: the first time a valid,
  // conflict-free setup exists. After that, expand/collapse is user-driven
  // (this flag keeps us from fighting a manual re-expand on every recompute).
  const [autoCollapsed, setAutoCollapsed] = useState(false)

  // ── Intake reset ───────────────────────────────────────
  // Clearing intake state is exposed (used when switching schools) and run
  // automatically whenever the selected school changes, so one school's
  // uploads never leak into another's report preview.
  const resetIntake = useCallback(() => {
    setRawFiles([])
    setManualPairs([])
    setPickerFileId(null)
    setStatus('')
    setPeriodDate('')
    setPeriodType('ytd')
    setPeriodTouched(false)
    setIntakeExpanded(true)
    setOpeningOverrides({})
    setMappedOverlay({})
    setMappingAccts(new Set())
    setPromotePy(true)
    setAutoCollapsed(false)
  }, [])

  // NOTE: the old schoolId-change reset effect is gone. AppProvider is remounted
  // (AuthedShell keys it by `${schoolId}:${hydrationToken}`) on every school
  // switch AND every completed hydrate, so intake state can't leak across
  // schools and the hydrated seed is never clobbered by a reset.

  // ── Smart-intake file loading (event handler, not an effect) ───
  // Each dropped/browsed file: insert a 'parsing' entry immediately, then
  // ingest -> validate -> classify, and replace it with a 'ready'/'error'
  // entry. Files resolve independently and concurrently.
  const schoolId = school?.id ?? null
  // The latest A1 auto-sort (autoSortAccounts, declared further down), for the
  // file handlers to call after a read. Synced in an effect, never in render.
  const autoSortRef = useRef(null)
  const loadFiles = useCallback(
    (fileList, forcedRole = null) => {
      const list = Array.from(fileList || [])
      if (!list.length) return
      setStatus(`Reading ${list.length} file${list.length > 1 ? 's' : ''}…`)
      setIntakeExpanded(true)

      // The school's remembered layouts + numbers, fetched ONCE per drop. Any
      // failure resolves to null, which is exactly today's parse.
      const memoryP = getIntakeMemory(schoolId).then((m) => {
        setIntakeMemory(m)
        return m
      })

      list.forEach(async (file) => {
        const id = uid()
        setRawFiles((prev) => [
          ...prev,
          { id, fileName: file.name, fileSize: file.size, status: 'parsing' },
        ])

        let bytes = null
        try {
          // #52 — a PDF is rebuilt into its table by the API; the card keeps the PDF's name.
          bytes = await readBytes(await asTableFile(schoolId, file))
          const memory = await memoryP
          const result = ingest(file.name, bytes, { memory })

          // When a file is dropped/browsed INTO a specific empty slot, honor
          // that intent: stamp the slot's role as a confirmed override instead
          // of using the auto-classification. The classification ALGORITHM is
          // untouched — we just pin the resolved role for this entry.
          const entry = buildReadyEntry({
            id,
            fileName: file.name,
            fileSize: file.size,
            bytes,
            result,
            role: forcedRole,
            roleConfirmed: forcedRole != null,
            roleFromSlot: forcedRole != null,
          })
          const { rows, suggestion } = entry

          setRawFiles((prev) => prev.map((f) => (f.id === id ? entry : f)))
          // A1: a statement export's accounts sort themselves (no-op for a TB).
          void autoSortRef.current?.(entry.rows, entry.metadata, file.name)

          // NOTE: the period date/type are NO LONGER stamped here. They are
          // PURELY DERIVED from whichever file ends up occupying the CY slot
          // (see effectivePeriodDate/effectivePeriodType below) until the user
          // edits them. Stamping at load time fought that derivation and could
          // not see the FINAL slot assignment, so it is removed.

          setStatus(
            `✓ ${file.name} — ${rows.length} accounts (${suggestion.role.toUpperCase()})`
          )
        } catch (err) {
          // #32: a file KYRO couldn't read says WHY in plain words, asks the one
          // question that unblocks it, and — when the grid could be read at all —
          // keeps its bytes + preview so the person can show KYRO the columns.
          const failure = failureFromError(err)
          setRawFiles((prev) =>
            prev.map((f) =>
              f.id === id
                ? {
                    id,
                    fileName: file.name,
                    fileSize: file.size,
                    status: 'error',
                    error: failureText(failure),
                    failure,
                    bytes: failure.canPick ? bytes : null,
                    // Where it was dropped, so "Use these columns" puts it
                    // back in that slot rather than asking for a role.
                    role: forcedRole,
                    roleConfirmed: forcedRole != null,
                    roleFromSlot: forcedRole != null,
                  }
                : f
            )
          )
          // Open the picker for the first readable failure (never steal it from
          // one already open). An event handler, never an effect.
          if (failure.canPick) setPickerFileId((prev) => prev ?? id)
          setStatus(`⚠ ${file.name}: ${failure.reason}`)
        }
      })
    },
    [schoolId]
  )

  // Load files PINNED to a specific role (drop/browse into an empty slot).
  const loadFilesForRole = useCallback(
    (role, fileList) => loadFiles(fileList, role),
    [loadFiles]
  )

  // A merged P&L + Balance Sheet entry fans the role out to both halves.
  const setFileRole = useCallback(
    (id, role) => {
      setRawFiles((prev) => setRoleInRaw(prev, files, id, role))
    },
    [files],
  )

  // Remove a file. Unsaved files are just dropped from local state. A PERSISTED
  // file is a stored import in Postgres, so a local filter alone would leave it
  // in the database and it would re-appear on the next hydrate — we delete the
  // import for real, then re-hydrate (which reconciles the period's snapshot:
  // regenerated without it, or cleared when no CY remains). Optimistic local
  // removal gives instant feedback; refresh() bumps the hydration token so the
  // provider remounts on the authoritative post-delete seed.
  //
  // A MERGED P&L + Balance Sheet entry removes only the halves added in this
  // session (a saved half reappears as its own card) and never deletes anything
  // on the server — it was never saved as itself.
  const removeFile = useCallback(
    async (id) => {
      const { deleteImport } = removeIntakeEntry([], [], files, id)
      const target = deleteImport
      setRawFiles((prev) => removeIntakeEntry(prev, [], files, id).rawFiles)
      setManualPairs((prev) => removeIntakeEntry([], prev, files, id).manualPairs)
      const gone = new Set([id, ...memberIdsOf(files, id)])
      setPickerFileId((prev) => (prev && gone.has(prev) ? null : prev))
      if (readOnly || !target?.persisted || !target.importId || !school?.id) return
      try {
        setStatus(`Deleting ${target.fileName}…`)
        await importsApi.delete(school.id, target.importId)
        setStatus(`Removed ${target.fileName}.`)
      } catch {
        setStatus(`Could not delete ${target.fileName}. Please try again.`)
      } finally {
        // Re-hydrate either way: confirms the delete, or restores the file if the
        // request failed (so local state never drifts from the server).
        await persistence.refresh()
      }
    },
    [files, readOnly, school, persistence],
  )

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

  // ── PY AUTO-PROMOTE derivations ───────────────────────────────────────────
  // The Prior-Year file's OWN inferred period (date/type). When promoted it is
  // saved as its own period with a role-cy import (a CY-only period generates a
  // snapshot → an annual trend point).
  const pyDetected = useMemo(
    () => (byRole.py?.metadata ? inferPeriod(byRole.py.metadata) : null),
    [byRole],
  )
  // Skip promotion when a saved period already covers the PY end-date with a CY
  // import (idempotency — no duplicate/collapse on re-save).
  const pyExistsAsPeriod = useMemo(
    () =>
      !!pyDetected?.periodEndDate &&
      (persistence.periods || []).some(
        (p) => p.periodEndDate === pyDetected.periodEndDate && p.roles?.cy,
      ),
    [pyDetected, persistence.periods],
  )
  // Promotable only when the PY slot is a fresh upload (not a history fill, not
  // already persisted), it has its own end-date DIFFERENT from the CY period, and
  // no saved period already covers it.
  const pyPromotable = useMemo(
    () =>
      !!byRole.py &&
      byRole.py.status === 'ready' &&
      !byRole.py.fromHistory &&
      !byRole.py.persisted &&
      !!pyDetected?.periodEndDate &&
      pyDetected.periodEndDate !== effectivePeriodDate &&
      !pyExistsAsPeriod,
    [byRole, pyDetected, effectivePeriodDate, pyExistsAsPeriod],
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

  // ── Sort flagged ("N to review") accounts ─────────────────────────────────
  // (The old one-account mapAccount is gone: every pick now goes through the
  // review popup's ONE save below.)
  /**
   * Sort SEVERAL accounts in ONE request.
   *
   * The review panel's "use all suggestions" once fired one save per account, so a
   * 33-account trial balance sent 33 concurrent PATCHes — each merging into the
   * same row and rebuilding the statements. Most picks were lost and the school
   * was left with numbers that were WRONG rather than missing. (The server-side
   * merge is atomic now too; this is the other half — one request, one rebuild.)
   */
  //
  // `onlyNew` makes the save FILL-ONLY on the server: an account the school's
  // mapping already places keeps its category, so approving pre-filled
  // suggestions (or carrying a renumbered account's category) can never
  // re-point a pick this browser can't see.
  //
  // `chosen` (the review popup passes it) = the accounts the PERSON picked.
  // Those are their decision and go as a normal merge — never silently dropped
  // by fill-only — while the untouched suggestions go fill-only. Two requests
  // at most, one after the other (never concurrent), each rebuilding once.
  const mapAccounts = useCallback(
    async (entries, { onlyNew = false, chosen = null } = {}) => {
      const keys = Object.keys(entries ?? {})
      if (readOnly || !school?.id || keys.length === 0) return
      const picked = {}
      const rest = {}
      for (const k of keys) {
        if (chosen && chosen.has(String(k))) picked[k] = entries[k]
        else rest[k] = entries[k]
      }
      setMappedOverlay((prev) => ({ ...prev, ...entries }))
      setMappingAccts((prev) => {
        const n = new Set(prev)
        for (const k of keys) n.add(String(k))
        return n
      })
      const saved = []
      try {
        if (Object.keys(rest).length > 0) {
          await mappingApi.mergeEntries(school.id, rest, { onlyNew })
          saved.push(...Object.keys(rest))
        }
        if (Object.keys(picked).length > 0) {
          await mappingApi.mergeEntries(school.id, picked)
          saved.push(...Object.keys(picked))
        }
        rememberPicks(school.id, entries)
        setStatus(`Sorted ${keys.length} account${keys.length === 1 ? '' : 's'}.`)
        window.dispatchEvent(
          new CustomEvent('penny:data-changed', { detail: { key: 'metrics' } }),
        )
        return true
      } catch {
        // Roll back only what didn't save; what did save is on the server.
        const savedSet = new Set(saved)
        if (saved.length > 0) {
          const kept = {}
          for (const k of saved) kept[k] = entries[k]
          rememberPicks(school.id, kept)
          window.dispatchEvent(
            new CustomEvent('penny:data-changed', { detail: { key: 'metrics' } }),
          )
        }
        setMappedOverlay((prev) => {
          const next = { ...prev }
          for (const k of keys) if (!savedSet.has(k)) delete next[k]
          return next
        })
        // Plain words and a next step — never the raw error ("Network Error").
        setStatus('We couldn’t save your account sorting just now. Press Review accounts to try again.')
        return false
      } finally {
        setMappingAccts((prev) => {
          const n = new Set(prev)
          for (const k of keys) n.delete(String(k))
          return n
        })
      }
    },
    [readOnly, school],
  )

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
        sourceName: String(entry.fileName || '').slice(0, 255),
        rows: entry.rows,
        metadata: entry.metadata || {},
      })
      // This tab keeps the bytes (never sent) so "Change columns" survives the
      // post-save remount.
      if (entry.bytes) {
        rememberBytes(school?.id, String(entry.fileName || '').slice(0, 255), entry.rows, entry.bytes)
      }
    }
    if (imports.length === 0) return null

    // Build the payload array. The PY-promote period goes FIRST and the primary
    // CY period LAST, so the single terminal refresh in savePeriods settles focus
    // on the current year (the PY becomes just another saved trend point). The PY
    // file is filed as role cy in its OWN period so it generates a snapshot. The
    // Audit slot is intentionally NOT promoted (it shares PY's end-date).
    const payloads = []
    let promoted = false
    if (promotePy && pyPromotable) {
      promoted = true
      payloads.push({
        periodEndDate: pyDetected.periodEndDate,
        periodType: pyDetected.periodType,
        label: undefined,
        imports: [
          {
            role: 'cy',
            sourceName: String(byRole.py.fileName || '').slice(0, 255),
            rows: byRole.py.rows,
            metadata: byRole.py.metadata || {},
          },
        ],
      })
    }
    const cyPayload = {
      periodEndDate: effectivePeriodDate,
      periodType: effectivePeriodType,
      label: undefined,
      imports,
    }
    payloads.push(cyPayload)

    // Name the CY as the intended focus so the remount/refresh keys on it (and
    // stays put if only the PY promotion lands). When a promotion actually
    // occurred, the success label names BOTH years so the auto-created PY period
    // isn't a silent surprise. Focus/label are otherwise the pre-fix behavior.
    const savedLabel = promoted
      ? `Saved FY${effectivePeriodDate.slice(0, 4)} · added FY${pyDetected.periodEndDate.slice(
          0,
          4,
        )} to your trend`
      : null

    const { saved } = await persistence.savePeriods(payloads, { focus: cyPayload, savedLabel })
    // A save can add a picked layout / KYRO's numbers to the school's memory.
    invalidateIntakeMemory(school?.id)
    return saved.find((s) => s.payload === cyPayload)?.snapshot ?? null
  }, [
    school,
    readOnly,
    byRole,
    effectivePeriodDate,
    effectivePeriodType,
    promotePy,
    pyPromotable,
    pyDetected,
    persistence,
  ])

  // ── ACTIVE CHART: DEFAULT_CHART with this session's category picks merged ────
  // A copy of DEFAULT_CHART whose mapping.entries are the defaults overlaid with
  // mappedOverlay (overlay wins, last spread). Passed as `chart` to the preview
  // generateReports AND as findUnmapped's 2nd arg in the cards, so a fresh pick
  // both drops the account out of "to review" and lights up the statements.
  // Pure derivation (no setState); overlay keys are String(acct) and the engine
  // coerces its numeric lookups identically. Declared ABOVE the reports memo so
  // reports can depend on it.
  const activeChart = useMemo(
    () => ({
      ...DEFAULT_CHART,
      mapping: {
        ...DEFAULT_CHART.mapping,
        entries: { ...DEFAULT_CHART.mapping.entries, ...mappedOverlay },
      },
    }),
    [mappedOverlay],
  )

  // ── What the SERVER already places (A4) ─────────────────────────────────────
  // GET /mapping returns no entries, so after a reload this browser only knows
  // the default chart. The saved snapshot was built with the school's real
  // mapping and lists the accounts IT couldn't place; for the saved files that
  // list is the whole review — any other account is the server's, and asking
  // again would let "Approve" overwrite a pick this browser can't see. Only a
  // snapshot of THIS intake's period counts.
  const latestSnapshot = persistence?.latestSnapshot ?? null
  const serverMapped = useMemo(() => {
    if (!latestSnapshot) return new Set()
    const snapPeriod = latestSnapshot.fiscalPeriodId
    if (snapPeriod && initialPeriod?.id && snapPeriod !== initialPeriod.id) return new Set()
    return serverMappedAccts(latestSnapshot, rawFiles)
  }, [latestSnapshot, rawFiles, initialPeriod])

  // The accounts still waiting for a person, across the intake (unique accts).
  const review = useMemo(
    () => reviewSummary(files, activeChart, serverMapped),
    [files, activeChart, serverMapped],
  )

  // ── A1: a QuickBooks statement export sorts itself ──────────────────────────
  // A Profit and Loss / Balance Sheet export says which section every account
  // sits in (metadata.statement.sections) — as reliable as the AccountType the
  // live QuickBooks sync files by. Accounts whose section AND name make the
  // category clear drop out of "to review" and into the live preview straight
  // away. Accounts whose class is known but whose exact category isn't stay
  // "to review", pre-filled. A real trial balance has no section facts, so
  // nothing here touches it: it keeps confirm-first review.
  //
  // PREVIEW ONLY — THIS NEVER WRITES THE SCHOOL'S MAPPING. The browser can't see
  // the school's stored picks (GET /mapping returns no entries), so a PATCH from
  // here would re-point an account the school already sorted (67000 picked as
  // admin last year, auto-filed back to fixedOther this year) and the server
  // would rebuild every period with it. The SAVE does the persisting:
  // ImportsService.create applies the same sure, section-backed categories
  // against the school's REAL mapping and never re-points a known account. And
  // locally it only FILLS gaps — a pick already in this session's overlay wins.
  const autoSortAccounts = useCallback(
    (rows, metadata, fileName) => {
      if (readOnly || !school?.id) return
      let sections = {}
      try {
        sections = statementSections(metadata)
      } catch {
        sections = {}
      }
      if (Object.keys(sections).length === 0) return
      const unmapped = findUnmapped(rows || [], activeChart).filter(
        (r) => !serverMapped.has(String(r.acct)),
      )
      const { entries, review: left } = autoMapEntries(unmapped, sections)
      const n = Object.keys(entries).length
      if (n === 0) return
      setMappedOverlay((prev) => {
        const next = { ...prev }
        for (const [k, v] of Object.entries(entries)) if (next[k] == null) next[k] = v
        return next
      })
      setStatus(
        `✓ ${fileName} — sorted ${n} account${n === 1 ? '' : 's'} by their QuickBooks sections` +
          (left > 0 ? `; ${left} ${left === 1 ? 'needs' : 'need'} a quick check.` : '.'),
      )
    },
    [readOnly, school, activeChart, serverMapped],
  )
  // loadFiles / applyColumns are declared above this; they reach the latest
  // autoSortAccounts through autoSortRef, synced after each render (never in render).
  useEffect(() => {
    autoSortRef.current = autoSortAccounts
  }, [autoSortAccounts])

  // ── Column picker (#32) ─────────────────────────────────────────────────────
  const openColumnPicker = useCallback((id) => setPickerFileId(id), [])
  const closeColumnPicker = useCallback(() => setPickerFileId(null), [])

  // Re-read a file with the columns the person picked. Runs in the handler (the
  // picker already showed the same read live and only enables its button on a
  // success). The entry keeps its id; a saved entry becomes an unsaved copy so
  // autosave posts the corrected import. Returns true when it read.
  const applyColumns = useCallback(
    (id, choice) => {
      const target = rawFiles.find((f) => f.id === id)
      if (!target?.bytes || !choice) return false
      try {
        const result = ingest(target.fileName, target.bytes, { columns: choice, memory: intakeMemory })
        const keepRole = !!target.roleConfirmed && !!target.role
        let entry = buildReadyEntry({
          id,
          fileName: target.fileName,
          fileSize: target.fileSize,
          bytes: target.bytes,
          result,
          role: keepRole ? target.role : null,
          roleConfirmed: keepRole,
          roleFromSlot: keepRole && !!target.roleFromSlot,
        })
        // A file KYRO couldn't read on its own rarely classifies with any
        // confidence — and then sat in the This-year slot asking "Choose
        // role". When nothing else holds This year, that is where it goes.
        const thisYearTaken = rawFiles.some(
          (f) => f.id !== id && f.status === 'ready' && !f.fromHistory && f.role === 'cy',
        )
        const unsure = entry.role === 'unknown' || (entry.suggestion?.confidence ?? 0) < 0.5
        if (!keepRole && unsure && !thisYearTaken) {
          entry = { ...entry, role: 'cy', roleConfirmed: true, roleFromSlot: true }
        }
        setRawFiles((prev) => prev.map((f) => (f.id === id ? entry : f)))
        setPickerFileId(null)
        setStatus(`✓ ${target.fileName} — ${entry.rows.length} accounts read with your columns`)
        void autoSortRef.current?.(entry.rows, entry.metadata, target.fileName)
        return true
      } catch (err) {
        setStatus(`⚠ ${target.fileName}: ${failureText(failureFromError(err))}`)
        return false
      }
    },
    [rawFiles, intakeMemory],
  )

  // "Combine anyway": force a P&L half and a Balance Sheet half together.
  const combineFiles = useCallback((aId, bId) => {
    if (!aId || !bId || aId === bId) return
    setManualPairs((prev) => [
      ...prev.filter((p) => ![p.plId, p.bsId].some((x) => x === aId || x === bId)),
      { plId: aId, bsId: bId },
    ])
  }, [])

  // Re-key an account KYRO numbered (#40). Validated by the parser (income
  // starts with 4, expenses 5–9, not already used). Returns the plain message
  // when refused, null when done. A saved entry becomes an unsaved copy so the
  // corrected numbers are what autosave stores; a category already picked for
  // the old number follows it to the new one.
  const renumberAccount = useCallback(
    (id, fromAcct, toAcct) => {
      if (readOnly) return 'This view is read-only.'
      const from = Number(fromAcct)
      const to = typeof toAcct === 'string' && toAcct.trim() === '' ? NaN : Number(toAcct)
      const member = memberHolding(rawFiles, files, id, from)
      if (!member || !member.metadata) return 'Only accounts KYRO numbered can be renumbered.'
      const refused = validateSyntheticRenumber(member.rows, member.metadata, from, to)
      if (refused) return refused
      if (to === from) return null
      let next
      try {
        next = renumberSynthetic(member.rows, member.metadata, from, to)
      } catch (err) {
        return err?.message || 'That number can’t be used.'
      }
      setRawFiles((prev) =>
        prev.map((f) =>
          f.id === member.id
            ? {
                ...f,
                rows: next.rows,
                metadata: next.metadata,
                persisted: false,
                importId: undefined,
                balance: validateDataset(next.rows),
                unmappedCount: findUnmapped(next.rows).length,
              }
            : f,
        ),
      )
      // Carry the old number's category to the new one — FILL-ONLY. "No
      // entry for `to`" is judged against THIS browser's chart (defaults +
      // overlay), not the school's stored picks, and `entries[from]` is often
      // an unsaved auto-sort guess; a plain merge could re-point an account the
      // school already filed (41500 development → other) and rebuild every
      // period. onlyNew: an account the server already places keeps its own.
      const entries = activeChart.mapping?.entries || {}
      if (entries[from] != null && entries[to] == null) {
        void mapAccounts({ [String(to)]: entries[from] }, { onlyNew: true })
      }
      setStatus(`Account ${from} is now ${to}.`)
      return null
    },
    [readOnly, rawFiles, files, activeChart, mapAccounts],
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
        school: effectiveSchool,
        chart: activeChart,
      })
    } catch {
      return null
    }
  }, [byRole, effectiveSchool, canGenerate, activeChart])

  // ── Intake mode (empty | review | collapsed) ────────────────
  const hasUnresolved = conflicts.length > 0

  // Auto-collapse ONCE on the first valid, conflict-free setup (spec point
  // 6: "once set up… collapses into a slim summary strip"). Done as a
  // render-time state transition (the pattern this repo already uses for
  // tab reset) — NOT a setState-in-effect — so it stays clean under the
  // react-hooks lint rule. Subsequent expand/collapse is fully user-driven.
  // (State, not a ref: a ref written during render is invisible to React.)
  if (autoCollapse && reports && !hasUnresolved && !autoCollapsed) {
    setAutoCollapsed(true)
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

  // ── Autosave (opt-in via the autoSave prop) ─────────────────
  // Once a valid, conflict-free trial balance is in (canGenerate) with unsaved
  // changes (dirty), persist automatically after a short debounce so the user
  // never has to hunt for Save. The debounce coalesces rapid CY/PY/Audited
  // uploads into ONE save; after a save the files become `persisted` (on the
  // post-save remount) so `dirty` flips false and this can't loop. `save`'s
  // identity changing on each edit resets the timer, so we only fire once the
  // uploads settle. This calls an ACTION (save) — no setState-in-effect.
  const anyParsing = useMemo(() => files.some((f) => f.status === 'parsing'), [files])
  useEffect(() => {
    if (!autoSave || readOnly) return undefined
    if (!canGenerate || !dirty || anyParsing) return undefined
    if (persistence.saveState === 'saving') return undefined
    const id = window.setTimeout(() => {
      void save()
    }, 1400)
    return () => window.clearTimeout(id)
  }, [autoSave, readOnly, canGenerate, dirty, anyParsing, persistence.saveState, save])

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
    // PY auto-promote surface (consumed by PromotePyToggle under the PY slot).
    promotePy,
    setPromotePy,
    pyPromotable,
    pyDetected,
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
    // #32 column picker / #40 pairing + re-key.
    intakeMemory,
    pickerFileId,
    openColumnPicker,
    closeColumnPicker,
    applyColumns,
    combineFiles,
    renumberAccount,
    // Category-mapping (intake "assign a category" editor). activeChart drives
    // the preview + per-file unmapped detection; mapAccounts persists picks;
    // mappingAccts is the per-row in-flight set (consumers call .has(key)).
    activeChart,
    mapAccounts,
    mappingAccts,
    // A4: accounts the saved snapshot shows the server already places, and the
    // intake-wide review queue (unique accounts) the callout + cards read.
    serverMappedAccts: serverMapped,
    review,
    // A5: the review popup is scoped to this school.
    schoolId,
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
