import { useRef, useState } from 'react'
import { UploadCloud, FileSpreadsheet, Download, Pencil, Trash2 } from 'lucide-react'
import {
  parseDisbursementTable,
  autoMapColumns,
  mappingToDisbursements,
  toApiRows,
  disbursementTemplateCsv,
} from '../../../lib/reconcileMapping.js'
import ColumnMappingPanel from './ColumnMappingPanel.jsx'
import DisbursementRowsEditor from './DisbursementRowsEditor.jsx'

const ACCEPT = '.csv,.xlsx,.xls'

function readBytes(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsArrayBuffer(file)
  })
}

/**
 * Funding-org disbursement intake. Parses a CSV/XLSX IN-BROWSER, auto-maps the
 * columns, shows the mapping step + preview, and on confirm PUTs the parsed rows
 * (replace semantics). Also offers a template download and a manual row editor.
 * Owner/accountant only (parent gates rendering); viewers never see this.
 */
export default function DisbursementIntake({ existing, onSave, onClear, saving }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [parse, setParse] = useState(null) // { fileName, headers, rows }
  const [mapping, setMapping] = useState(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const handleFile = async (file) => {
    setError('')
    try {
      const bytes = await readBytes(file)
      const { headers, rows } = parseDisbursementTable(file.name, bytes)
      if (headers.length === 0 || rows.length === 0) {
        setError('Could not find a header row + data in that file.')
        return
      }
      setParse({ fileName: file.name, headers, rows })
      setMapping(autoMapColumns(headers))
      setEditing(false)
    } catch {
      setError('Could not read that file. Use a .csv, .xls, or .xlsx export.')
    }
  }

  const disbursements =
    parse && mapping ? mappingToDisbursements(parse.rows, mapping) : []

  const confirmImport = async () => {
    await onSave(toApiRows(disbursements))
    setParse(null)
    setMapping(null)
  }

  const downloadTemplate = () => {
    const blob = new Blob([disbursementTemplateCsv()], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'disbursements-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (editing) {
    return (
      <DisbursementRowsEditor
        existing={existing}
        saving={saving}
        onCancel={() => setEditing(false)}
        onSave={async (rows) => {
          await onSave(rows)
          setEditing(false)
        }}
      />
    )
  }

  if (parse && mapping) {
    return (
      <ColumnMappingPanel
        fileName={parse.fileName}
        headers={parse.headers}
        mapping={mapping}
        setMapping={setMapping}
        disbursements={disbursements}
        saving={saving}
        onConfirm={confirmImport}
        onCancel={() => {
          setParse(null)
          setMapping(null)
        }}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f) handleFile(f)
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-colors ${
          dragging ? 'border-gold bg-gold/5' : 'border-border bg-white hover:border-gold/50'
        }`}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow">
          <UploadCloud size={22} />
        </span>
        <p className="font-serif text-base font-semibold text-navy">
          Drop the funding-org disbursement export
        </p>
        <p className="text-[14px] text-muted">
          CSV or Excel from Step Up For Students · parsed in your browser, columns mapped next
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} className="btn-ghost">
          <FileSpreadsheet size={15} /> Choose file
        </button>
        <button type="button" onClick={() => setEditing(true)} className="btn-ghost">
          <Pencil size={15} /> {existing && existing.length > 0 ? 'Edit rows' : 'Add manually'}
        </button>
        <button type="button" onClick={downloadTemplate} className="btn-ghost">
          <Download size={15} /> Download template
        </button>
        {existing && existing.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[14px] font-semibold text-muted transition-colors hover:text-danger disabled:opacity-50"
          >
            <Trash2 size={15} /> Clear set
          </button>
        )}
      </div>

      {error && <p className="text-[14px] text-danger">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
