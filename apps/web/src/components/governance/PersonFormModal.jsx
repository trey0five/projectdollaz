// ─────────────────────────────────────────────────────────────────────────────
// PersonFormModal — the EDIT modal for a governance person (board / finance team
// / staff), built on the shared EntityFormModal (dark navy/gold overlay over the
// light page; v2-aware like every other *FormModal). The ADD path is the batch
// RecordFlow wizard ('governance.person') — this modal mirrors the other pages'
// convention where *FormModals stay the edit path.
//
// PATCH contract (frozen): nullable fields clear via null (title / termStart /
// termEnd / email / bio); groups is always the full array; active a real boolean.
// termEnd < termStart is caught client-side (the service 400s it anyway).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { UserRound } from 'lucide-react'
import EntityFormModal, { Field, fieldInput, fieldTextarea } from '../ui/EntityFormModal.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import { PERSON_GROUPS, groupLabel } from './peopleMeta.js'

export const EMPTY_PERSON = {
  name: '',
  title: '',
  groups: ['board'],
  termStart: '',
  termEnd: '',
  email: '',
  bio: '',
  active: true,
}

/** The exact PATCH body (frozen contract) — null clears the nullable fields. */
export function personBody(form) {
  return {
    name: form.name.trim(),
    title: form.title.trim() ? form.title.trim() : null,
    groups: [...form.groups],
    termStart: form.termStart ? form.termStart : null,
    termEnd: form.termEnd ? form.termEnd : null,
    email: form.email.trim() ? form.email.trim() : null,
    bio: form.bio.trim() ? form.bio.trim() : null,
    active: !!form.active,
  }
}

/** Group toggles — a segmented control (ink when pressed; no hue fill). */
function GroupToggles({ groups, onToggle }) {
  return (
    <div className="seg mt-1.5">
      {PERSON_GROUPS.map((g) => {
        const on = groups.includes(g)
        return (
          <button key={g} type="button" aria-pressed={on} onClick={() => onToggle(g)} className="seg-btn">
            {groupLabel(g)}
          </button>
        )
      })}
    </div>
  )
}

export default function PersonFormModal({ initial, onClose, onSave, reduce }) {
  const [form, setForm] = useState(initial ?? EMPTY_PERSON)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const toggleGroup = (g) =>
    setForm((f) => ({
      ...f,
      groups: f.groups.includes(g) ? f.groups.filter((x) => x !== g) : [...f.groups, g],
    }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setErr('A name is required.')
      return
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setErr('That email address doesn’t look right.')
      return
    }
    if (form.termStart && form.termEnd && form.termEnd < form.termStart) {
      setErr('The term can’t end before it starts.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave(personBody(form))
      onClose()
    } catch {
      setErr('Could not save this person.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityFormModal
      open
      icon={UserRound}
      title={initial ? 'Edit person' : 'Add person'}
      subtitle="Board, finance team, or staff"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={initial ? 'Save person' : 'Add person'}
      reduce={reduce}
    >
      <Field label="Name" span={2} index={0} reduce={reduce}>
        <input value={form.name} onChange={set('name')} maxLength={200} className={fieldInput} autoFocus />
      </Field>
      <Field label="Title" index={1} reduce={reduce}>
        <input
          value={form.title}
          onChange={set('title')}
          maxLength={200}
          placeholder="Board Chair, Trustee, CFO…"
          className={fieldInput}
        />
      </Field>
      <Field label="Email" index={2} reduce={reduce}>
        <input
          type="email"
          value={form.email}
          onChange={set('email')}
          maxLength={200}
          className={fieldInput}
        />
      </Field>
      <Field label="Groups" span={2} index={3} reduce={reduce} hint="A person can belong to more than one.">
        <GroupToggles groups={form.groups} onToggle={toggleGroup} />
      </Field>
      <Field label="Term start" index={4} reduce={reduce}>
        <DatePicker
          value={form.termStart}
          onChange={(v) => setForm((f) => ({ ...f, termStart: v }))}
          className={fieldInput}
        />
      </Field>
      <Field label="Term end" index={5} reduce={reduce}>
        <DatePicker
          value={form.termEnd}
          onChange={(v) => setForm((f) => ({ ...f, termEnd: v }))}
          className={fieldInput}
        />
      </Field>
      <Field label="Bio / qualifications" span={2} index={6} reduce={reduce}>
        <textarea value={form.bio} onChange={set('bio')} maxLength={2000} rows={2} className={fieldTextarea} />
      </Field>
      <label className="flex cursor-pointer select-none items-center gap-2.5 text-[14px] font-medium text-ink sm:col-span-2">
        <input
          type="checkbox"
          checked={!!form.active}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
          className="h-[18px] w-[18px] rounded-sm accent-[#2563EB]"
        />
        Active (currently serving)
      </label>
    </EntityFormModal>
  )
}
