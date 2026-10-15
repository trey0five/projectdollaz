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
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        data-active={dragging ? 'true' : undefined}
        className="b2-drop"
      >
        <span className="b2-drop-icon">
          <UploadCloud size={26} aria-hidden="true" />
        </span>
        <p className="text-heading font-semibold text-ink">
          Drop the funding-org disbursement export
        </p>
        <p className="text-small text-ink2">
          CSV or Excel from Step Up For Students · parsed in your browser, columns mapped next
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} className="btn btn-secondary">
          <FileSpreadsheet size={14} aria-hidden="true" /> Choose file
        </button>
        <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary">
          <Pencil size={14} aria-hidden="true" /> {existing && existing.length > 0 ? 'Edit rows' : 'Add manually'}
        </button>
        <button type="button" onClick={downloadTemplate} className="btn btn-secondary">
          <Download size={14} aria-hidden="true" /> Download template
        </button>
        {existing && existing.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            disabled={saving}
            className="btn btn-quiet"
          >
            <Trash2 size={14} aria-hidden="true" /> Clear set
          </button>
        )}
      </div>

      {error && (
        <p className="b2-callout b2-risk" role="alert">
          {error}
        </p>
      )}

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
