// My Account: edit first/last name (email read-only) + a Change Password form
// using the LIVE PasswordRequirements meter. Profile save refreshes AuthContext;
// password change revokes other sessions server-side (current one survives).
// Two-factor authentication card (status + the MfaWizard enable/disable/
// regenerate flows) sits between Change Password and Appearance.
// Owners also get the "Try the new look (beta)" ui.v2 toggle (per-browser flag).
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSchools } from '../../context/SchoolContext.jsx'
import { useUiV2, setUiV2 } from '../../context/UiFlagContext.jsx'
import { authApi, apiErrorMessage } from '../../lib/api.js'
import { useAutosave } from '../../hooks/useAutosave.js'
import {
  TextField,
  PasswordField,
  FormError,
  FormSuccess,
} from '../auth/fields.jsx'
import { AutosaveBar } from '../AutosaveIndicator.jsx'
import PasswordRequirements, { allRequirementsMet } from '../auth/PasswordRequirements.jsx'
import SettingsCard from './SettingsCard.jsx'
import Pill from '../ui/surface/Pill.jsx'
import MfaWizard from './MfaWizard.jsx'

export default function AccountSection() {
  const { user, refreshMe } = useAuth()
  const { activeSchool } = useSchools()
  const uiV2 = useUiV2()
  const isOwner = activeSchool?.role === 'owner'

  const [firstName, setFirstName] = useState(user?.first_name || '')
  const [lastName, setLastName] = useState(user?.last_name || '')

  const dirty =
    firstName !== (user?.first_name || '') || lastName !== (user?.last_name || '')

  const {
    saving: pSaving,
    error: pErr,
    saveNow: saveProfile,
  } = useAutosave({
    dirty,
    signal: `${firstName} ${lastName}`,
    save: async () => {
      await authApi.updateMe({ first_name: firstName, last_name: lastName })
      await refreshMe()
    },
  })

  // Change-password local state
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [cwErr, setCwErr] = useState('')
  const [cwOk, setCwOk] = useState('')
  const [cwBusy, setCwBusy] = useState(false)

  const canChange =
    current.length > 0 && allRequirementsMet(next) && next === confirm && !cwBusy

  // ── Two-factor authentication state ─────────────────────────────────────────
  const [mfa, setMfa] = useState(null) // { mfa_enabled, backup_codes_remaining, enrolled_at }
  const [mfaErr, setMfaErr] = useState('')
  const [wizard, setWizard] = useState(null) // 'enable' | 'disable' | 'regenerate' | null

  const loadMfa = useCallback(async () => {
    try {
      const res = await authApi.mfaStatus()
      setMfa(res.data)
      setMfaErr('')
    } catch (err) {
      setMfaErr(apiErrorMessage(err, 'Could not load two-factor status.'))
    }
  }, [])

  useEffect(() => {
    loadMfa()
  }, [loadMfa])

  const onMfaChanged = useCallback(async () => {
    // The server-side truth changed: refresh both the card and user.mfa_enabled
    // (which drives the Home nudge).
    await Promise.allSettled([loadMfa(), refreshMe()])
  }, [loadMfa, refreshMe])

  const changePassword = async () => {
    if (!canChange) return
    setCwErr('')
    setCwOk('')
    setCwBusy(true)
    try {
      await authApi.changePassword({ current_password: current, new_password: next })
      setCwOk('Password changed. Other sessions were signed out.')
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setCwErr(apiErrorMessage(err, 'Could not change your password.'))
    } finally {
      setCwBusy(false)
    }
  }

  return (
    <>
      <SettingsCard title="Profile" description="Your name as it appears across the app.">
        <TextField
          label="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          autoComplete="given-name"
        />
        <TextField
          label="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          autoComplete="family-name"
        />
        {/* Same Field as the name inputs; TextField has no disabled skin (and a
            className would replace its input class), so the read-only state is
            an inline ground fill + ink-2 text. */}
        <TextField
          label="Email"
          value={user?.email || ''}
          disabled
          readOnly
          autoComplete="email"
          style={{ background: 'rgb(var(--c-ground))', color: 'rgb(var(--c-ink-2))', cursor: 'not-allowed' }}
        />
        <p className="-mt-3 mb-5 text-[14px] text-ink2">Email is read-only for now.</p>

        {pErr && <FormError>{pErr}</FormError>}

        <AutosaveBar
          saving={pSaving}
          dirty={dirty}
          error={!!pErr}
          onSaveNow={saveProfile}
          className="mt-3"
        />
      </SettingsCard>

      <SettingsCard title="Change Password" description="Other devices will be signed out.">
        <PasswordField
          label="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
        <PasswordField
          label="New password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
        />
        <PasswordRequirements password={next} />
        <div className="mt-5">
          <PasswordField
            label="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {confirm.length > 0 && next !== confirm && (
          <p className="mb-3 text-[14px] tone-risk">Passwords do not match.</p>
        )}

        {cwErr && <FormError>{cwErr}</FormError>}
        {cwOk && <FormSuccess>{cwOk}</FormSuccess>}

        <motion.button
          whileTap={{ scale: canChange ? 0.98 : 1 }}
          onClick={changePassword}
          disabled={!canChange}
          className="btn btn-primary mt-3 w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8"
        >
          {cwBusy ? 'Updating…' : 'Change password'}
        </motion.button>
      </SettingsCard>

      <SettingsCard
        title="Two-factor authentication"
        description="A 6-digit code from your authenticator app, required at every sign-in."
      >
        {mfaErr && !mfa ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-[14px] text-ink2">{mfaErr}</p>
            <button
              type="button"
              onClick={loadMfa}
              className="text-[14px] font-semibold text-ink2 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : !mfa ? (
          <p className="text-[14px] text-ink2">Loading…</p>
        ) : mfa.mfa_enabled ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Pill variant="status" tone="good">
                <ShieldCheck size={14} aria-hidden="true" />
                Enabled
              </Pill>
              {mfa.enrolled_at && (
                <span className="text-[14px] text-ink2">
                  since{' '}
                  {new Date(mfa.enrolled_at).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[14px] text-ink2">
              {mfa.backup_codes_remaining <= 3 && (
                <AlertTriangle size={14} className="shrink-0 text-ink2" />
              )}
              <span className={mfa.backup_codes_remaining <= 3 ? 'font-medium text-ink' : ''}>
                {mfa.backup_codes_remaining} recovery code
                {mfa.backup_codes_remaining === 1 ? '' : 's'} remaining
                {mfa.backup_codes_remaining <= 3 ? ' — generate a new set soon.' : '.'}
              </span>
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setWizard('regenerate')}
                className="rounded-[8px] border border-hair/[0.18] px-4 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:border-hair/[0.3]"
              >
                Regenerate recovery codes
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setWizard('disable')}
                className="rounded-[8px] border border-hair/[0.18] px-4 py-2.5 text-[14px] font-semibold tone-risk transition-colors hover:bg-ink/[0.04]"
              >
                Turn off
              </motion.button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Pill variant="status" tone="neutral">
                Off
              </Pill>
              <span className="text-[14px] text-ink2">
                Your account is protected by your password only.
              </span>
            </div>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setWizard('enable')}
              className="btn btn-primary mt-4 w-full sm:w-auto sm:px-8"
            >
              Turn on two-factor
            </motion.button>
          </>
        )}
      </SettingsCard>

      <MfaWizard
        open={!!wizard}
        mode={wizard || 'enable'}
        onClose={() => setWizard(null)}
        onChanged={onMfaChanged}
      />

      {/* Early access: the ui.v2 redesign flag (owner-only while in beta).
          Per-browser — persists to localStorage, then reloads for a clean swap. */}
      {isOwner && (
        <SettingsCard
          title="Appearance"
          description="Early access to the redesigned interface. Applies to this browser only."
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-ink">Try the new look (beta)</p>
              <p className="mt-0.5 text-[14px] text-ink2">
                A brighter, modern theme. The page reloads when you switch — printed
                reports and board documents keep the classic look either way.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={uiV2}
              aria-label="Try the new look (beta)"
              onClick={() => setUiV2(!uiV2)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 ${
                uiV2 ? 'border-[#2563EB] bg-[#2563EB]' : 'border-hair/[0.18] bg-ink/15'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  uiV2 ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </SettingsCard>
      )}
    </>
  )
}
