// Organization: org name (editable by an owner of >=1 school in the org, per
// the /organizations/me `can_edit` flag) + a list of the org's schools with
// quick-switch (reuses SchoolContext.setActiveSchool) and a Create-school
// affordance. No billing/payments here (Phase 1D).
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Building2, Check, Plus } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { orgsApi, apiErrorMessage } from '../../lib/api.js'
import { sanitizeDecimal } from '../../lib/numericInput.js'
import { useAutosave } from '../../hooks/useAutosave.js'
import { FormError } from '../auth/fields.jsx'
import { AutosaveBar } from '../AutosaveIndicator.jsx'
import SettingsCard from './SettingsCard.jsx'

const inputCls =
  'w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted'

export default function OrgSection() {
  const { activeId, setActiveSchool, createSchool } = useSchools()

  const [org, setOrg] = useState(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await orgsApi.me()
      setOrg(res.data)
      setName(res.data?.name ?? '')
    } catch {
      setOrg(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const canEdit = !!org?.can_edit

  // Inline create-school form (toggled).
  const [showCreate, setShowCreate] = useState(false)
  const [csName, setCsName] = useState('')
  const [csBegin, setCsBegin] = useState('')
  const [csPy, setCsPy] = useState('')
  const [csAudit, setCsAudit] = useState('')
  const [csErr, setCsErr] = useState('')
  const [csBusy, setCsBusy] = useState(false)

  const num = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const createNew = async () => {
    if (!csName.trim() || csBusy) return
    setCsErr('')
    setCsBusy(true)
    try {
      await createSchool({
        name: csName.trim(),
        netAssetsBegin: num(csBegin),
        pyNetAssetsBegin: num(csPy),
        auditNetAssetsBegin: num(csAudit),
      })
      setCsName('')
      setCsBegin('')
      setCsPy('')
      setCsAudit('')
      setShowCreate(false)
      await load()
    } catch (e) {
      setCsErr(apiErrorMessage(e, 'Could not create the school.'))
    } finally {
      setCsBusy(false)
    }
  }

  const dirty = canEdit && name.trim() !== '' && name.trim() !== (org?.name ?? '')

  const { saving, error: err, saveNow } = useAutosave({
    enabled: canEdit,
    dirty,
    signal: name,
    save: async () => {
      const res = await orgsApi.update(org.id, { name: name.trim() })
      setOrg((o) => ({ ...o, name: res.data.name }))
    },
  })

  if (loading) {
    return (
      <SettingsCard title="Organization">
        <p className="text-[16px] text-muted">Loading…</p>
      </SettingsCard>
    )
  }

  if (!org) {
    return (
      <SettingsCard title="Organization">
        <p className="text-[16px] text-muted">No organization found.</p>
      </SettingsCard>
    )
  }

  return (
    <>
      <SettingsCard
        title="Organization"
        description={canEdit ? 'Rename your organization.' : 'Read-only — only an owner can edit.'}
      >
        <div className="mb-5">
          <label className="mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-muted">
            Organization name
          </label>
          <input
            className={inputCls}
            value={name}
            disabled={!canEdit}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {err && <FormError>{err}</FormError>}

        {canEdit && (
          <AutosaveBar
            saving={saving}
            dirty={dirty}
            error={!!err}
            onSaveNow={saveNow}
            className="mt-3"
          />
        )}
      </SettingsCard>

      <SettingsCard
        title="Schools"
        description="Switch the active school or create a new one."
        action={
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border-2 border-gold/40 px-3 py-1.5 text-[15px] font-semibold text-navy transition-colors hover:bg-gold/10"
          >
            <Plus size={15} /> Create school
          </button>
        }
      >
        {showCreate && (
          <div className="mb-5 rounded-xl border border-gold/30 bg-navy/[0.02] p-4">
            <input
              className={`${inputCls} mb-3`}
              value={csName}
              placeholder="School name"
              onChange={(e) => setCsName(e.target.value)}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                className={inputCls}
                inputMode="decimal"
                value={csBegin}
                placeholder="Net assets begin"
                onChange={(e) => setCsBegin(sanitizeDecimal(e.target.value, { allowNegative: true }))}
              />
              <input
                className={inputCls}
                inputMode="decimal"
                value={csPy}
                placeholder="Prior-year begin"
                onChange={(e) => setCsPy(sanitizeDecimal(e.target.value, { allowNegative: true }))}
              />
              <input
                className={inputCls}
                inputMode="decimal"
                value={csAudit}
                placeholder="Audited begin"
                onChange={(e) => setCsAudit(sanitizeDecimal(e.target.value, { allowNegative: true }))}
              />
            </div>
            {csErr && (
              <div className="mt-3">
                <FormError>{csErr}</FormError>
              </div>
            )}
            <motion.button
              whileTap={{ scale: csName.trim() ? 0.98 : 1 }}
              onClick={createNew}
              disabled={!csName.trim() || csBusy}
              className="btn-primary mt-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {csBusy ? 'Creating…' : 'Create'}
            </motion.button>
          </div>
        )}
        <ul className="space-y-2">
          {(org.schools || []).map((s) => {
            const active = s.id === activeId
            return (
              <li key={s.id}>
                <button
                  onClick={() => setActiveSchool(s.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                    active
                      ? 'border-gold bg-gold/10'
                      : 'border-border bg-white hover:border-gold/40'
                  }`}
                >
                  <span className="flex items-center gap-2 text-[16px] text-ink">
                    <Building2 size={16} className="text-gold" />
                    <span className="font-semibold">{s.name}</span>
                    <span className="rounded bg-navy/[0.06] px-2 py-0.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {s.role}
                    </span>
                  </span>
                  {active && (
                    <span className="flex items-center gap-1 text-[14px] font-semibold text-navy">
                      <Check size={15} className="text-gold" /> Active
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </SettingsCard>
    </>
  )
}
