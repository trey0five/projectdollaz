// ─────────────────────────────────────────────────────────────────────────────
// useFileDrop — the ONE drag-and-drop primitive for file pickers.
//
// Owner 2026-10-25: "why don't these sections allow drag and drop as well? it
// should be like the finance module in that aspect". Finance's sorter took drops;
// Academics, Knowledge, the logo and attach pickers only took a click. Rather
// than paste a fourth copy of onDragOver/onDragLeave/onDrop into each, every
// picker spreads `dropProps` from here onto the element it already renders and
// hands the dropped file(s) to the SAME function its <input onChange> calls —
// so a drop and a click can never behave differently.
//
//   const { dragging, dropProps, rejection } = useFileDrop({
//     accept: '.csv,text/csv', onFiles: ([f]) => choose(f),
//   })
//   <label {...dropProps} className={dragging ? 'is-over' : ''}>…</label>
//
// What it handles:
//   • dragenter/dragleave with a DEPTH COUNTER, so crossing the zone's own
//     children doesn't flicker the highlight off and on;
//   • preventDefault on dragover (without it the browser never fires `drop`);
//   • non-file drags (selected text, a link) are ignored — no highlight;
//   • `disabled` ignores everything;
//   • the picker's own `accept` list: a file it doesn't take is refused with a
//     plain-language line ("That's a PDF — this takes Excel or CSV.");
//   • single vs multiple: a single-file picker gets the first accepted file;
//   • stopPropagation on drop, so a page-level catcher (Finance's DragOverlay)
//     doesn't load the same file a second time; the zone carries
//     data-drop-zone so that overlay steps aside while a drag is over it;
//   • a single-file picker given several files says it took only the first;
//   • while any zone is mounted, a file dropped OUTSIDE every zone is swallowed
//     instead of the browser navigating away to open it, and the cursor shows
//     not-allowed there (the app has no global guard — only the trial-balance
//     intake's DragOverlay catches drops).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'

/** True when the drag carries files (not text, a link or an image from the page). */
export function hasFiles(e) {
  const types = e?.dataTransfer?.types
  if (!types) return false
  // DOMStringList (old Firefox) has .contains; arrays and FrozenArrays have .includes.
  if (typeof types.includes === 'function') return types.includes('Files')
  if (typeof types.contains === 'function') return types.contains('Files')
  return Array.from(types).includes('Files')
}

/** "a.CSV" → "csv"; no extension → "". */
function extOf(name) {
  const m = /\.([^./\\]+)$/.exec(String(name ?? ''))
  return m ? m[1].toLowerCase() : ''
}

/** Split an <input accept> string into lower-cased tokens. Empty = anything. */
export function parseAccept(accept) {
  return String(accept ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
}

/** Does this file satisfy the accept list — by extension, exact type, or wildcard? */
export function fileMatchesAccept(file, accept) {
  const tokens = parseAccept(accept)
  if (tokens.length === 0) return true
  const ext = extOf(file?.name)
  const type = String(file?.type ?? '').toLowerCase()
  return tokens.some((t) => {
    if (t.startsWith('.')) return ext !== '' && t === `.${ext}`
    if (t.endsWith('/*')) return type.startsWith(t.slice(0, -1))
    return type !== '' && t === type
  })
}

// Plain names for the kinds of file people actually drop.
const KIND_BY_EXT = {
  pdf: 'a PDF',
  xlsx: 'an Excel file',
  xls: 'an Excel file',
  xlsm: 'an Excel file',
  csv: 'a CSV file',
  tsv: 'a text file',
  txt: 'a text file',
  doc: 'a Word document',
  docx: 'a Word document',
  ppt: 'a PowerPoint file',
  pptx: 'a PowerPoint file',
  zip: 'a ZIP file',
  png: 'an image',
  jpg: 'an image',
  jpeg: 'an image',
  gif: 'an image',
  webp: 'an image',
  heic: 'an image',
  svg: 'an image',
}

/** "That’s a PDF" / "That’s a .numbers file" / "That kind of file can’t go here". */
export function describeFile(file) {
  const ext = extOf(file?.name)
  if (KIND_BY_EXT[ext]) return `That’s ${KIND_BY_EXT[ext]}`
  if (String(file?.type ?? '').startsWith('image/')) return 'That’s an image'
  if (ext) return `That’s a .${ext} file`
  return 'That kind of file can’t go here'
}

// Accept tokens → the words a person would use. Order = the order shown.
const LABELS = [
  ['Excel', ['.xlsx', '.xls', '.xlsm', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']],
  ['CSV', ['.csv', 'text/csv']],
  ['ZIP', ['.zip', 'application/zip']],
  ['text', ['.txt', '.tsv']],
  ['PDF', ['.pdf', 'application/pdf']],
  ['PNG', ['image/png', '.png']],
  ['JPG', ['image/jpeg', '.jpg', '.jpeg']],
  ['SVG', ['image/svg+xml', '.svg']],
  ['an image', ['image/*']],
]

/** ['Excel','CSV','PDF'] → "Excel, CSV or PDF". */
function orList(words) {
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`
}

/** The accept list in words: ".csv,text/csv,text/plain" → "CSV". */
export function describeAccept(accept) {
  const tokens = new Set(parseAccept(accept))
  const words = LABELS.filter(([, ts]) => ts.some((t) => tokens.has(t))).map(([w]) => w)
  // text/plain alone means "text"; next to CSV it is just how browsers type a .csv.
  if (tokens.has('text/plain') && words.length === 0) words.push('text')
  return orList(words) || 'a different kind of file'
}

/** The line shown when a drop is refused. */
export function rejectionMessage(file, accept, acceptLabel) {
  return `${describeFile(file)} — this takes ${acceptLabel || describeAccept(accept)}.`
}

/**
 * The highlight a SMALL drop target (an Attach link, a logo button) wears while
 * a file is over it — the primary-blue ring of the a2-drop [data-over] look.
 * Kept here, a scanned src/ file, so Tailwind's JIT sees the classes.
 */
export const DROP_HIGHLIGHT = 'outline outline-2 outline-offset-2 outline-[#2563EB]/60 bg-[#2563EB]/[0.06]'

// ── Page guard: a drop outside every zone must not open the file in the tab ──
let guardCount = 0
const guardOver = (e) => {
  // A zone (or Finance's DragOverlay) already took this dragover — leave its
  // dropEffect alone. Anywhere else: cancel the browser's open-the-file default
  // AND show the not-allowed cursor, so the page doesn't look like it will take
  // a drop it is about to swallow.
  if (!hasFiles(e) || e.defaultPrevented) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
}
const guardDrop = (e) => {
  if (hasFiles(e)) e.preventDefault()
}
function retainGuard() {
  if (typeof window === 'undefined') return () => {}
  if (guardCount === 0) {
    window.addEventListener('dragover', guardOver)
    window.addEventListener('drop', guardDrop)
  }
  guardCount += 1
  let released = false
  return () => {
    if (released) return
    released = true
    guardCount -= 1
    if (guardCount === 0) {
      window.removeEventListener('dragover', guardOver)
      window.removeEventListener('drop', guardDrop)
    }
  }
}

/**
 * @param {object}   opts
 * @param {(files: File[]) => void} opts.onFiles  the picker's own handler (same as its onChange)
 * @param {string}   [opts.accept]       the picker's accept string ('' = anything)
 * @param {boolean}  [opts.multiple]     false (default) → only the first accepted file
 * @param {boolean}  [opts.disabled]     ignore every drag and drop
 * @param {string}   [opts.acceptLabel]  words for the accept list, if the derived ones read badly
 * @param {(msg: string, files: File[]) => void} [opts.onReject]  also told when a drop is refused
 */
export function useFileDrop({ onFiles, accept = '', multiple = false, disabled = false, acceptLabel, onReject } = {}) {
  const [dragging, setDragging] = useState(false)
  const [rejection, setRejection] = useState('')
  const depth = useRef(0)

  useEffect(() => retainGuard(), [])

  // A drag that ends anywhere else (dropped outside, Esc, left the window
  // mid-child) leaves no dragleave on us — reset on the window's say-so.
  useEffect(() => {
    if (!dragging || typeof window === 'undefined') return undefined
    const reset = () => {
      depth.current = 0
      setDragging(false)
    }
    window.addEventListener('drop', reset, true)
    window.addEventListener('dragend', reset, true)
    return () => {
      window.removeEventListener('drop', reset, true)
      window.removeEventListener('dragend', reset, true)
    }
  }, [dragging])

  // Plain per-render handlers: always the latest onFiles/accept/disabled.
  const onDragEnter = (e) => {
    if (disabled || !hasFiles(e)) return
    e.preventDefault()
    depth.current += 1
    setDragging(true)
  }

  const onDragOver = (e) => {
    if (disabled || !hasFiles(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    // dragenter can be missed (the drag started inside the zone) — be sure.
    if (depth.current === 0) depth.current = 1
    setDragging(true)
  }

  const onDragLeave = (e) => {
    if (disabled || !hasFiles(e)) return
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setDragging(false)
  }

  const onDrop = (e) => {
    if (disabled || !hasFiles(e)) return
    e.preventDefault()
    e.stopPropagation()
    depth.current = 0
    setDragging(false)
    const all = Array.from(e.dataTransfer?.files ?? [])
    if (all.length === 0) return
    const ok = all.filter((f) => fileMatchesAccept(f, accept))
    const refused = all.filter((f) => !fileMatchesAccept(f, accept))
    if (ok.length === 0) {
      const msg = rejectionMessage(refused[0], accept, acceptLabel)
      setRejection(msg)
      onReject?.(msg, refused)
      return
    }
    let note = null
    if (refused.length > 0 && multiple) {
      const msg = `${refused.length === 1 ? 'Skipped one file' : `Skipped ${refused.length} files`}: ${rejectionMessage(refused[0], accept, acceptLabel)}`
      note = [msg, refused]
    } else if (!multiple && all.length > 1) {
      // A single-file picker takes the first — say so, never drop the rest silently.
      const left = all.filter((f) => f !== ok[0])
      note = [`Only one file at a time — took ${ok[0].name}, left out ${left.length === 1 ? '1 other' : `${left.length} others`}.`, left]
    }
    setRejection(note ? note[0] : '')
    onFiles?.(multiple ? ok : [ok[0]])
    // AFTER onFiles: a picker that clears its error line when a file arrives
    // (the logo pickers do) would otherwise wipe this note straight away.
    if (note) onReject?.(note[0], note[1])
  }

  const clearRejection = useCallback(() => setRejection(''), [])
  // Disabled mid-drag (an upload started): the highlight goes at once.
  const over = dragging && !disabled

  return {
    dragging: over,
    rejection,
    clearRejection,
    dropProps: {
      // Marks a real drop target: Finance's full-window DragOverlay steps aside
      // while a drag is over one, so the drop reaches it (see DragOverlay.jsx).
      'data-drop-zone': disabled ? undefined : 'true',
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
      'data-over': over ? 'true' : undefined,
    },
  }
}

export default useFileDrop
