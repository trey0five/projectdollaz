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
import { Truck, Pencil, Trash2, Mail, Phone } from 'lucide-react'
import { DataTable, Pill } from '../ui/surface/index.js'
import RegisterEmpty from '../module/RegisterEmpty.jsx'
import '../../styles/pending/b1-domain.css'
import EntityFormModal, {
  Field,
  fieldInput,
  fieldTextarea,
} from '../ui/EntityFormModal.jsx'


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

export default function VendorsPanel({ vendors, loading, canEdit, onEdit, onDelete, onToggleActive }) {
  const [actionErr, setActionErr] = useState('')

  if (loading)
    return (
      <div className="b1-empty">
        <p>Loading vendors…</p>
      </div>
    )
  if (vendors.length === 0)
    return (
      <RegisterEmpty
        icon={Truck}
        text="No vendors yet."
        sub="Add the companies that do your repairs."
        actionLabel="Add a vendor"
      />
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

  const columns = [
    {
      key: 'name',
      header: 'Vendor',
      sortable: true,
      render: (v) => (
        <div className={`py-1.5 ${v.active ? '' : 'opacity-60'}`}>
          <span className="font-semibold">{v.name}</span>
          {v.notes ? <span className="dt-sub max-w-md truncate">{v.notes}</span> : null}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (v) => (
        <div className="py-1.5 text-ink2">
          {v.contactName ? <span className="block text-ink">{v.contactName}</span> : null}
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
            {v.contactEmail ? (
              <span className="inline-flex items-center gap-1">
                <Mail size={12} aria-hidden="true" />
                {v.contactEmail}
              </span>
            ) : null}
            {v.contactPhone ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Phone size={12} aria-hidden="true" />
                {v.contactPhone}
              </span>
            ) : null}
            {!v.contactName && !v.contactEmail && !v.contactPhone ? '—' : null}
          </span>
        </div>
      ),
    },
    { key: 'category', header: 'Category', sortable: true, render: (v) => <span className="text-ink2">{v.category ?? '—'}</span> },
    {
      key: 'active',
      header: 'Status',
      render: (v) =>
        canEdit ? (
          <button
            type="button"
            role="switch"
            aria-checked={!!v.active}
            aria-label={`${v.active ? 'Deactivate' : 'Activate'} ${v.name}`}
            onClick={() => doToggle(v)}
            className="inline-flex items-center gap-2 rounded-sm text-[12px] font-semibold text-ink2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]/50"
          >
            <span className={`relative h-[18px] w-8 rounded-full transition-colors ${v.active ? 'bg-ink' : 'bg-hair/25'}`}>
              <span
                className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${
                  v.active ? 'left-[16px]' : 'left-[2px]'
                }`}
              />
            </span>
            {v.active ? 'Active' : 'Inactive'}
          </button>
        ) : (
          <Pill variant="status" tone={v.active ? 'good' : 'neutral'}>
            {v.active ? 'Active' : 'Inactive'}
          </Pill>
        ),
    },
  ]
  if (canEdit)
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      headerClassName: 'dt-num',
      className: 'dt-num',
      render: (v) => (
        <div className="dt-actions inline-flex justify-end gap-1">
          <button type="button" onClick={() => onEdit(v)} aria-label={`Edit ${v.name}`} title="Edit" className="b1-icon-act">
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => doDelete(v)}
            aria-label={`Delete ${v.name}`}
            title="Delete (400s if referenced — deactivate instead)"
            className="b1-icon-act b1-icon-act-danger"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    })

  return (
    <div className="space-y-2">
      {actionErr ? <p className="text-[12.5px] font-medium text-risk">{actionErr}</p> : null}
      <DataTable caption="Vendors" columns={columns} rows={vendors} markOf={(v) => (v.active ? null : 'neutral')} />
    </div>
  )
}
