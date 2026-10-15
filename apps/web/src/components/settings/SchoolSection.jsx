// School settings: edit the active school's name + the three begin-balances
// (owner only), plus the School Comparison PROFILE (type / county / district /
// grade range) that shapes peer benchmarking. On save -> PATCH /schools/:id then
// SchoolContext.reloadSchools() so the report preview + peer groups pick up the
// change. Non-owners get a read-only view.
import '../../styles/pending/b2-finance.css'
import { useEffect, useState } from 'react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { schoolsApi, periodsApi, analyticsApi } from '../../lib/api.js'
import { sanitizeDecimal } from '../../lib/numericInput.js'
import { useAutosave } from '../../hooks/useAutosave.js'
import { FormError } from '../auth/fields.jsx'
import { AutosaveBar } from '../AutosaveIndicator.jsx'
import SettingsCard from './SettingsCard.jsx'
import { ImageUp, Trash2 } from 'lucide-react'
import { LOGO_ACCEPT, prepareLogo } from '../../lib/schoolLogo.js'
import { monogramOf } from '../home/SchoolCrest.jsx'
import { SCHOOL_TYPES, GRADE_KEYS, sizeBandOf, sizeBandLabel, gradeOrdinal } from '../../lib/peerVocab.js'

const labelCls =
  'b2-label'
const inputCls =
  'b2-input disabled:cursor-not-allowed disabled:bg-ground disabled:text-ink2'

export default function SchoolSection() {
  const { activeSchool, activeId, reloadSchools } = useSchools()
  const isOwner = activeSchool?.role === 'owner'

  const [name, setName] = useState('')
  const [begin, setBegin] = useState('')
  const [pyBegin, setPyBegin] = useState('')
  const [auditBegin, setAuditBegin] = useState('')

  // Sync the form fields from the active school. Track the last-synced id so we
  // only reset inputs when the school actually changes (preserving edits), and
  // adjust state during render (per React docs) instead of in an effect.
  const [syncedId, setSyncedId] = useState(null)
  if (activeSchool && activeSchool.id !== syncedId) {
    setSyncedId(activeSchool.id)
    setName(activeSchool.name ?? '')
    setBegin(String(activeSchool.netAssetsBegin ?? ''))
    setPyBegin(String(activeSchool.pyNetAssetsBegin ?? ''))
    setAuditBegin(String(activeSchool.auditNetAssetsBegin ?? ''))
  }

  const num = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  // Compare in the persisted form so a save can't re-trigger itself on harmless
  // formatting differences. Money is Decimal(18,2) — compare at cents so a value
  // that rounds on store (e.g. "100.999") doesn't read as perpetually dirty.
  const cents = (v) => Math.round(num(v) * 100)
  const dirty =
    isOwner &&
    !!activeSchool &&
    name.trim() !== '' &&
    (name.trim() !== (activeSchool.name ?? '') ||
      cents(begin) !== cents(activeSchool.netAssetsBegin) ||
      cents(pyBegin) !== cents(activeSchool.pyNetAssetsBegin) ||
      cents(auditBegin) !== cents(activeSchool.auditNetAssetsBegin))

  const { saving, error: err, saveNow } = useAutosave({
    enabled: isOwner,
    dirty,
    signal: `${name} ${begin} ${pyBegin} ${auditBegin}`,
    save: async () => {
      await schoolsApi.update(activeId, {
        name: name.trim(),
        netAssetsBegin: num(begin),
        pyNetAssetsBegin: num(pyBegin),
        auditNetAssetsBegin: num(auditBegin),
      })
      await reloadSchools()
    },
  })

  if (!activeSchool) {
    return (
      <SettingsCard title="School">
        <p className="text-[16px] text-ink2">Select a school first.</p>
      </SettingsCard>
    )
  }

  return (
    <>
      <SchoolLogoCard activeSchool={activeSchool} isOwner={isOwner} />

      <SettingsCard
        title="School settings"
        description={
          isOwner
            ? 'Update the name and beginning net-asset balances the engine uses.'
            : 'Read-only — only an owner can edit these.'
        }
      >
        <div className="mb-5">
          <label className={labelCls}>School name</label>
          <input
            className={inputCls}
            value={name}
            disabled={!isOwner}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="mb-5">
          <label className={labelCls}>Net assets — beginning (CY)</label>
          <input
            className={inputCls}
            inputMode="decimal"
            value={begin}
            disabled={!isOwner}
            onChange={(e) => setBegin(sanitizeDecimal(e.target.value, { allowNegative: true }))}
          />
        </div>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <div className="mb-5">
            <label className={labelCls}>Prior-year begin</label>
            <input
              className={inputCls}
              inputMode="decimal"
              value={pyBegin}
              disabled={!isOwner}
              onChange={(e) => setPyBegin(sanitizeDecimal(e.target.value, { allowNegative: true }))}
            />
          </div>
          <div className="mb-5">
            <label className={labelCls}>Audited begin</label>
            <input
              className={inputCls}
              inputMode="decimal"
              value={auditBegin}
              disabled={!isOwner}
              onChange={(e) => setAuditBegin(sanitizeDecimal(e.target.value, { allowNegative: true }))}
            />
          </div>
        </div>

        {err && <FormError>{err}</FormError>}

        {isOwner && (
          <AutosaveBar
            saving={saving}
            dirty={dirty}
            error={!!err}
            onSaveNow={saveNow}
            className="mt-3"
          />
        )}
      </SettingsCard>

      <SchoolProfileCard
        activeSchool={activeSchool}
        activeId={activeId}
        isOwner={isOwner}
        reloadSchools={reloadSchools}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SchoolProfileCard — the peer-benchmarking profile (School Comparison). Type,
// county, district, grade range. Size band is DERIVED from the latest operational
// enrollment (never stored) and shown read-only. Same autosave/dirty idiom as the
// balances card; a client grade-order guard mirrors the server's BadRequest.
// ─────────────────────────────────────────────────────────────────────────────
function SchoolProfileCard({ activeSchool, activeId, isOwner, reloadSchools }) {
  const [schoolType, setSchoolType] = useState('')
  const [county, setCounty] = useState('')
  const [district, setDistrict] = useState('')
  const [gradeLow, setGradeLow] = useState('')
  const [gradeHigh, setGradeHigh] = useState('')

  const [syncedId, setSyncedId] = useState(null)
  if (activeSchool && activeSchool.id !== syncedId) {
    setSyncedId(activeSchool.id)
    setSchoolType(activeSchool.schoolType ?? '')
    setCounty(activeSchool.county ?? '')
    setDistrict(activeSchool.district ?? '')
    setGradeLow(activeSchool.gradeLow ?? '')
    setGradeHigh(activeSchool.gradeHigh ?? '')
  }

  // Latest operational enrollment → the read-only size band. Best-effort: on any
  // failure the chip degrades to the "set enrollment" note.
  const [enrollment, setEnrollment] = useState(null)
  useEffect(() => {
    let cancelled = false
    setEnrollment(null)
    Promise.resolve().then(async () => {
      if (cancelled || !activeSchool?.id) return
      try {
        const res = await periodsApi.list(activeSchool.id)
        const periods = Array.isArray(res.data) ? res.data : res.data?.periods ?? []
        if (!periods.length) return
        const latest = [...periods].sort((a, b) =>
          String(b.periodEndDate).localeCompare(String(a.periodEndDate)),
        )[0]
        if (!latest?.id) return
        const op = await analyticsApi.operational(activeSchool.id, latest.id)
        if (cancelled) return
        const e = op.data?.enrollment ?? op.data?.operational?.enrollment ?? null
        setEnrollment(Number.isFinite(e) ? e : null)
      } catch {
        /* leave enrollment null — the note covers it */
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeSchool?.id])

  const band = sizeBandLabel(sizeBandOf(enrollment))

  // Grade-order guard (mirrors the server): both set and low > high blocks save.
  const gradeOrderBad =
    !!gradeLow && !!gradeHigh && gradeOrdinal(gradeLow) > gradeOrdinal(gradeHigh)

  const nn = (v) => (v && v.trim() !== '' ? v.trim() : null)
  const nz = (v) => (v && v !== '' ? v : null)

  const dirty =
    isOwner &&
    !!activeSchool &&
    !gradeOrderBad &&
    (nz(schoolType) !== (activeSchool.schoolType ?? null) ||
      nn(county) !== (activeSchool.county ?? null) ||
      nn(district) !== (activeSchool.district ?? null) ||
      nz(gradeLow) !== (activeSchool.gradeLow ?? null) ||
      nz(gradeHigh) !== (activeSchool.gradeHigh ?? null))

  const { saving, error: err, saveNow } = useAutosave({
    enabled: isOwner,
    dirty,
    signal: `${schoolType}|${county}|${district}|${gradeLow}|${gradeHigh}`,
    save: async () => {
      await schoolsApi.update(activeId, {
        schoolType: nz(schoolType),
        county: nn(county),
        district: nn(district),
        gradeLow: nz(gradeLow),
        gradeHigh: nz(gradeHigh),
      })
      await reloadSchools()
    },
  })

  // Completeness nudge: name the first blank dimension.
  const missing = []
  if (!nz(schoolType)) missing.push('type')
  if (!nn(county)) missing.push('county')
  if (!nn(district)) missing.push('district')
  if (!nz(gradeLow) || !nz(gradeHigh)) missing.push('grade range')

  const selectCls = inputCls
  return (
    <SettingsCard
      title="School profile"
      description={
        isOwner
          ? 'Type, location and grade range — these shape which schools you are benchmarked against.'
          : 'Read-only — only an owner can edit these.'
      }
    >
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <div className="mb-5">
          <label className={labelCls}>School type</label>
          <select
            className={selectCls}
            value={schoolType}
            disabled={!isOwner}
            onChange={(e) => setSchoolType(e.target.value)}
          >
            <option value="">Not set</option>
            {SCHOOL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-5">
          <label className={labelCls}>Size band</label>
          <div className="flex min-h-[36px] items-center gap-2 border-b border-hair">
            {band ? (
              <span className="text-[14px] font-semibold text-ink">{band}</span>
            ) : (
              <span className="text-[13.5px] text-ink2">Set enrollment under Data → Operational.</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <div className="mb-5">
          <label className={labelCls}>County</label>
          <input
            className={inputCls}
            maxLength={120}
            value={county}
            disabled={!isOwner}
            onChange={(e) => setCounty(e.target.value)}
          />
        </div>
        <div className="mb-5">
          <label className={labelCls}>District</label>
          <input
            className={inputCls}
            maxLength={120}
            value={district}
            disabled={!isOwner}
            onChange={(e) => setDistrict(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <div className="mb-5">
          <label className={labelCls}>Grade — low</label>
          <select
            className={selectCls}
            value={gradeLow}
            disabled={!isOwner}
            onChange={(e) => setGradeLow(e.target.value)}
          >
            <option value="">Not set</option>
            {GRADE_KEYS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-5">
          <label className={labelCls}>Grade — high</label>
          <select
            className={selectCls}
            value={gradeHigh}
            disabled={!isOwner}
            onChange={(e) => setGradeHigh(e.target.value)}
          >
            <option value="">Not set</option>
            {GRADE_KEYS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      {gradeOrderBad && <FormError>Grade low must be at or below grade high.</FormError>}
      {err && <FormError>{err}</FormError>}

      {isOwner && missing.length > 0 && (
        <p className="mt-1 rounded-lg bg-ink/[0.04] px-3.5 py-2.5 text-[13px] text-ink2">
          Add {missing[0]} to unlock {missing[0] === 'grade range' ? 'grade-range' : missing[0]} peer comparisons.
        </p>
      )}

      {isOwner && (
        <AutosaveBar
          saving={saving}
          dirty={dirty}
          error={!!err}
          onSaveNow={saveNow}
          className="mt-3"
        />
      )}
    </SettingsCard>
  )
}

/**
 * THE SCHOOL'S LOGO, WHERE A SCHOOL'S PROPERTIES LIVE.
 *
 * The uploader already existed — buried in step 4 of the board-report wizard.
 * That is the wrong home for it twice over: the logo is school-wide rather than
 * per-report, and nobody opens a report wizard to set up their school. It now
 * appears in School settings and the wizard reads whatever is set here.
 */
function SchoolLogoCard({ activeSchool, isOwner }) {
  const { updateSchool } = useSchools()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const logo = activeSchool?.logoBase64 || null

  const onFile = async (file) => {
    setErr('')
    const { dataUrl, error } = await prepareLogo(file)
    if (error) {
      setErr(error)
      return
    }
    setBusy(true)
    try {
      await updateSchool(activeSchool.id, { logoBase64: dataUrl })
    } catch {
      setErr('Could not save that logo.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setErr('')
    try {
      await updateSchool(activeSchool.id, { logoBase64: null })
    } catch {
      setErr('Could not remove the logo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsCard
      title="School logo"
      description={
        isOwner
          ? 'Shown on the daily briefing and on every board report cover. PNG, JPG or SVG — large files are shrunk automatically.'
          : 'Read-only — only an owner can change the logo.'
      }
    >
      <div className="flex flex-wrap items-center gap-5">
        <span
          className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-hair bg-white"
          aria-hidden="true"
        >
          {logo ? (
            <img src={logo} alt="" className="h-full w-full object-contain p-1.5" />
          ) : (
            <span className="font-serif text-[20px] font-semibold text-ink/45">
              {monogramOf(activeSchool?.name)}
            </span>
          )}
        </span>

        <div className="min-w-0">
          {/* Says what the reader sees when there is no logo, so the monogram
              beside it reads as a deliberate stand-in rather than a failure. */}
          <p className="text-[13.5px] text-ink2">
            {logo
              ? 'This logo is in use across the app.'
              : `No logo yet — the briefing shows “${monogramOf(activeSchool?.name)}”, built from the school name.`}
          </p>

          {isOwner ? (
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded-[8px] border border-hair/[0.18] px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-ink/[0.04] ${
                  busy ? 'pointer-events-none opacity-60' : ''
                }`}
              >
                <ImageUp size={15} />
                {logo ? 'Replace logo' : 'Upload a logo'}
                <input
                  type="file"
                  accept={LOGO_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) onFile(f)
                  }}
                />
              </label>
              {logo ? (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-hair/[0.18] px-3 py-2 text-[13px] font-semibold text-ink2 transition-colors hover:text-[rgb(var(--c-risk))] disabled:opacity-60"
                >
                  <Trash2 size={14} /> Remove
                </button>
              ) : null}
              {busy ? <span className="text-[12.5px] text-ink2">Saving…</span> : null}
            </div>
          ) : null}

          {err ? <p className="mt-2 text-[12.5px] font-semibold tone-risk">{err}</p> : null}
        </div>
      </div>
    </SettingsCard>
  )
}
