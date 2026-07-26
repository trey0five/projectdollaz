// ─────────────────────────────────────────────────────────────────────────────
// VendorsPanel — the Vendors register tab on the Facilities command center.
// Default export = the light register table (name / contact / category / active
// toggle / actions); named export VendorFormModal = the shared EntityFormModal
// add/edit form (FacilitiesPage owns the open/editing state, mirroring how the
// MaintenanceFormModal is owned). Deleting a vendor that is referenced by a
// maintenance item or a bid 400s server-side — surface the message and suggest
// deactivating instead (the active toggle).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Truck, Pencil, Trash2, Mail, Phone } from 'lucide-react'
import EntityFormModal, {
  Field,
  fieldInput,
  fieldTextarea,
} from '../ui/EntityFormModal.jsx'

const FAC_HUE = '#EA580C'

// ═══════════════════════════ VENDOR FORM MODAL ═══════════════════════════════

const EMPTY_VENDOR = {
  name: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  category: '',
  notes: '',
}

export function vendorToForm(v) {
  return {
    name: v.name ?? '',
    contactName: v.contactName ?? '',
    contactEmail: v.contactEmail ?? '',
    contactPhone: v.contactPhone ?? '',
    category: v.category ?? '',
    notes: v.notes ?? '',
  }
}

export function VendorFormModal({ open, initial, onClose, onSave, reduce }) {
  const [form, setForm] = useState(initial ?? EMPTY_VENDOR)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setErr('A vendor name is required.')
      return
    }
    setSaving(true)
    setErr('')
    try {
      await onSave({
        name: form.name.trim(),
        contactName: form.contactName.trim() ? form.contactName.trim() : null,
        contactEmail: form.contactEmail.trim() ? form.contactEmail.trim() : null,
        contactPhone: form.contactPhone.trim() ? form.contactPhone.trim() : null,
        category: form.category.trim() ? form.category.trim() : null,
        notes: form.notes.trim() ? form.notes.trim() : null,
      })
      onClose()
    } catch (e2) {
      setErr(e2?.response?.data?.message ?? 'Could not save this vendor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <EntityFormModal
      open={open}
      icon={Truck}
      title={initial ? 'Edit vendor' : 'Add vendor'}
      subtitle="Who does the work — referenced by maintenance items and bids"
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
      error={err}
      submitLabel={initial ? 'Save vendor' : 'Add vendor'}
      reduce={reduce}
    >
      <Field label="Name" span={2} index={0} reduce={reduce}>
        <input
          value={form.name}
          onChange={set('name')}
          maxLength={160}
          placeholder="e.g. ACME Roofing Co."
          className={fieldInput}
          autoFocus
        />
      </Field>
      <Field label="Contact name" index={1} reduce={reduce}>
        <input
          value={form.contactName}
          onChange={set('contactName')}
          maxLength={160}
          placeholder="e.g. Dana Alvarez"
          className={fieldInput}
        />
      </Field>
      <Field label="Category" index={2} reduce={reduce}>
        <input
          value={form.category}
          onChange={set('category')}
          maxLength={80}
          placeholder="e.g. Roofing"
          className={fieldInput}
        />
      </Field>
      <Field label="Contact email" index={3} reduce={reduce}>
        <input
          type="email"
          value={form.contactEmail}
          onChange={set('contactEmail')}
          maxLength={254}
          placeholder="e.g. dana@acmeroofing.com"
          className={fieldInput}
        />
      </Field>
      <Field label="Contact phone" index={4} reduce={reduce}>
        <input
          value={form.contactPhone}
          onChange={set('contactPhone')}
          maxLength={40}
          placeholder="e.g. (305) 555-0147"
          className={fieldInput}
        />
      </Field>
      <Field label="Notes" span={2} index={5} reduce={reduce}>
        <textarea
          value={form.notes}
          onChange={set('notes')}
          maxLength={4000}
          rows={2}
          className={fieldTextarea}
        />
      </Field>
    </EntityFormModal>
  )
}

// ═══════════════════════════ VENDORS REGISTER TABLE ══════════════════════════

function Th({ children, right }) {
  return (
    <th
      className={`px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

export default function VendorsPanel({
  vendors,
  loading,
  canEdit,
  reduce,
  onEdit,
  onDelete,
  onToggleActive,
}) {
  const [actionErr, setActionErr] = useState('')

  if (loading)
    return (
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
        <p className="text-[14px] text-muted">Loading vendors…</p>
      </div>
    )
  if (vendors.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-rule/60 bg-cream/50 px-6 py-12 text-center">
        <p className="font-serif text-[16px] italic text-muted">No vendors yet.</p>
        <p className="mt-1 text-[13px] text-muted">
          Add the companies that do your maintenance work — then reference them on items and bids.
        </p>
      </div>
    )

  const doDelete = async (v) => {
    setActionErr('')
    if (!window.confirm(`Delete vendor "${v.name}"?`)) return
    try {
      await onDelete(v)
    } catch (e) {
      setActionErr(
        e?.response?.data?.message ??
          'This vendor is referenced by items or bids — deactivate it instead.',
      )
    }
  }

  const doToggle = async (v) => {
    setActionErr('')
    try {
      await onToggleActive(v)
    } catch {
      setActionErr(`Could not ${v.active ? 'deactivate' : 'activate'} ${v.name}.`)
    }
  }

  return (
    <div className="space-y-2">
      {actionErr ? <p className="text-[12.5px] font-medium text-danger">{actionErr}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-rule/50">
        <table className="w-full text-left text-[14px]">
          <thead className="bg-cream">
            <tr>
              <Th>Vendor</Th>
              <Th>Contact</Th>
              <Th>Category</Th>
              <Th>Status</Th>
              {canEdit ? <Th right>Actions</Th> : null}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {vendors.map((v) => (
                <motion.tr
                  key={v.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  className={`group border-t border-rule/50 ${v.active ? '' : 'opacity-55'}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-semibold text-navy">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: v.active ? FAC_HUE : '#9CA3AF' }}
                      >
                        <Truck size={14} />
                      </span>
                      {v.name}
                    </div>
                    {v.notes ? (
                      <p className="mt-1 max-w-md truncate text-[12px] text-muted">{v.notes}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {v.contactName ? <div className="text-navy">{v.contactName}</div> : null}
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px]">
                      {v.contactEmail ? (
                        <span className="inline-flex items-center gap-1">
                          <Mail size={12} />
                          {v.contactEmail}
                        </span>
                      ) : null}
                      {v.contactPhone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} />
                          {v.contactPhone}
                        </span>
                      ) : null}
                      {!v.contactName && !v.contactEmail && !v.contactPhone ? '—' : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{v.category ?? '—'}</td>
                  <td className="px-4 py-3">
                    {canEdit ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!v.active}
                        aria-label={`${v.active ? 'Deactivate' : 'Activate'} ${v.name}`}
                        onClick={() => doToggle(v)}
                        className={`relative h-[22px] w-10 rounded-full transition ${
                          v.active ? '' : 'bg-rule'
                        }`}
                        style={v.active ? { backgroundColor: FAC_HUE } : undefined}
                      >
                        <span
                          className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all ${
                            v.active ? 'left-[22px]' : 'left-[3px]'
                          }`}
                        />
                      </button>
                    ) : (
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-semibold ${
                          v.active
                            ? 'border-emerald-300/70 bg-emerald-50 text-emerald-700'
                            : 'border-rule/60 bg-section text-muted'
                        }`}
                      >
                        {v.active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  {canEdit ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5 opacity-60 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => onEdit(v)}
                          aria-label={`Edit ${v.name}`}
                          title="Edit"
                          className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-gold/60 hover:text-navy"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => doDelete(v)}
                          aria-label={`Delete ${v.name}`}
                          title="Delete (400s if referenced — deactivate instead)"
                          className="rounded-lg border border-rule/60 p-1.5 text-muted transition hover:border-danger/50 hover:text-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  )
}
