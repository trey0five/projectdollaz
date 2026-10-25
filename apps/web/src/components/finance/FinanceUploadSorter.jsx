// ─────────────────────────────────────────────────────────────────────────────
// FinanceUploadSorter — the FIRST thing Finance → Add data shows (#43):
// "Upload your financial files — we'll figure out what each one is."
//
// Customer 2026-10-24: the old first step asked them to pick Trial balance /
// Monthly numbers / Budget before they could drop anything, and they didn't
// know which one their QuickBooks export was. Now they drop everything; each
// file gets a verdict from the SAME parsers the tiles run (lib/financeSort.js)
// and a one-line summary; Continue opens the right tile with the files already
// loaded (lib/pendingUploads.js). The three tiles stay one click away.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  FileSpreadsheet,
  FileWarning,
  Layers,
  Loader2,
  PiggyBank,
  Upload,
  X,
} from 'lucide-react'
import Button from '../ui/surface/Button.jsx'
import { getIntakeMemory } from '../../lib/intakeMemory.js'
import { DESTINATION, groupByDestination, sortFinanceFile } from '../../lib/financeSort.js'
import { stashPending } from '../../lib/pendingUploads.js'

const ACCEPT = '.xlsx,.xls,.csv,.tsv,.txt'

const KIND_ICON = {
  budget: PiggyBank,
  monthly: CalendarRange,
  half: FileSpreadsheet,
  annual: FileSpreadsheet,
  'multi-year': Layers,
  unread: FileWarning,
  unsupported: AlertTriangle,
}

let seq = 0
const nextId = () => `up-${Date.now()}-${(seq += 1)}`

export default function FinanceUploadSorter({ schoolId, canEdit = true, goToOption }) {
  const reduce = useReducedMotion()
  const inputRef = useRef(null)
  const [items, setItems] = useState([]) // { id, file, status: 'reading'|'done', verdict }
  const [dragging, setDragging] = useState(false)
  const memoryRef = useRef(null)

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length || !canEdit) return
    const seeded = files.map((file) => ({ id: nextId(), file, status: 'reading', verdict: null }))
    setItems((prev) => [...prev, ...seeded])
    if (memoryRef.current === null) {
      memoryRef.current = await getIntakeMemory(schoolId).catch(() => null)
    }
    await Promise.all(
      seeded.map(async (it) => {
        let verdict
        try {
          verdict = await sortFinanceFile(it.file, memoryRef.current)
        } catch (e) {
          verdict = {
            kind: 'unread',
            destination: 'tb-single',
            title: 'Couldn’t read this file',
            detail: e?.message || 'We’ll show you the first rows on the next screen so you can point at the right columns.',
          }
        }
        setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, status: 'done', verdict } : p)))
      }),
    )
  }

  const remove = (id) => setItems((prev) => prev.filter((p) => p.id !== id))

  const reading = items.some((it) => it.status === 'reading')
  const done = items.filter((it) => it.status === 'done' && it.verdict)
  const groups = groupByDestination(done.map((it) => ({ ...it.verdict, file: it.file })))

  const go = (destinationKey) => {
    const dest = DESTINATION[destinationKey]
    const files = (groups.get(destinationKey) || []).map((s) => s.file)
    if (!dest || !files.length) return
    stashPending(dest.pending, files)
    goToOption?.(dest.option)
  }

  return (
    <div className="panel-body space-y-5" data-testid="finance-upload-sorter">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (canEdit) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void addFiles(e.dataTransfer?.files)
        }}
        className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? 'border-[rgb(var(--c-module))] bg-[rgb(var(--c-module))]/[0.06]' : 'border-hair bg-ground'
        }`}
      >
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--c-module))]/[0.12] text-[rgb(var(--c-module))]">
          <Upload size={22} aria-hidden="true" />
        </span>
        <h3 className="mt-3 text-heading font-semibold text-ink">Upload your financial files</h3>
        <p className="mx-auto mt-1 max-w-[46rem] text-[14px] text-ink2">
          Drop your QuickBooks exports or spreadsheets — trial balance, Profit and Loss, Balance Sheet,
          month-end numbers, budget — and we’ll figure out what each one is. Drop several at once.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="primary"
            icon={<Upload size={14} />}
            disabled={!canEdit}
            onClick={() => inputRef.current?.click()}
          >
            Choose files
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
        <p className="mt-3 text-[12px] text-ink2">Excel or CSV · PDFs can’t be read yet · up to a few MB each</p>
      </div>

      {/* Verdicts */}
      {items.length > 0 && (
        <ul className="space-y-2" aria-label="Files and where they belong">
          {items.map((it) => {
            const v = it.verdict
            const Icon = v ? KIND_ICON[v.kind] || FileSpreadsheet : Loader2
            const dest = v?.destination ? DESTINATION[v.destination] : null
            const tone = v?.kind === 'unsupported' ? 'risk' : v?.kind === 'unread' ? 'watch' : 'ok'
            return (
              <motion.li
                key={it.id}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 rounded-xl border border-hair bg-white px-4 py-3"
                data-testid="sorted-file"
                data-kind={v?.kind || 'reading'}
              >
                <span
                  className={`mt-0.5 shrink-0 ${
                    tone === 'risk' ? 'text-[rgb(var(--c-risk))]' : tone === 'watch' ? 'text-[rgb(var(--c-watch))]' : 'text-[rgb(var(--c-module))]'
                  }`}
                >
                  <Icon size={18} className={it.status === 'reading' ? 'animate-spin' : ''} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">{it.file.name}</p>
                  {it.status === 'reading' ? (
                    <p className="text-[13px] text-ink2">Reading…</p>
                  ) : (
                    <p className="text-[13px] text-ink2">
                      <span className="font-medium text-ink">{v.title}</span>
                      {dest ? ` → ${dest.label}` : ''} · {v.detail}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${it.file.name}`}
                  onClick={() => remove(it.id)}
                  className="rounded-md p-1 text-ink2 transition-colors hover:bg-ground hover:text-[rgb(var(--c-risk))]"
                >
                  <X size={15} />
                </button>
              </motion.li>
            )
          })}
        </ul>
      )}

      {/* Continue — one button per destination the files landed in */}
      {done.length > 0 && !reading && groups.size > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="sorter-continue">
          {[...groups.entries()].map(([key, list]) => (
            <Button key={key} variant="primary" icon={<ArrowRight size={14} />} onClick={() => go(key)}>
              {groups.size === 1
                ? `Continue to ${DESTINATION[key].label}`
                : `${DESTINATION[key].label} (${list.length} file${list.length === 1 ? '' : 's'})`}
            </Button>
          ))}
          {groups.size > 1 && (
            <p className="basis-full text-[12.5px] text-ink2">
              These go to different places — open each in turn; the files wait for you.
            </p>
          )}
        </div>
      )}

      {/* The tiles, one click away */}
      <p className="text-[13px] text-ink2">
        Or choose what to add yourself:{' '}
        <button type="button" className="dt-link" onClick={() => goToOption?.('tb')}>Trial balance</button>
        {' · '}
        <button type="button" className="dt-link" onClick={() => goToOption?.('monthly')}>Monthly numbers</button>
        {' · '}
        <button type="button" className="dt-link" onClick={() => goToOption?.('budget')}>Budget</button>
      </p>
    </div>
  )
}
