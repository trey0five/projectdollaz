// ─────────────────────────────────────────────────────────────────────────────
// FileDropZone — the dashed "drop a file here, or choose one" box.
//
// The data-upload zones that only took a click (Academics' course marks and
// assessment results, the network results upload, the Knowledge library) now
// take a drop the way Finance → Add data does. One component so they look and
// behave alike: a dashed a2-drop box that lights up ([data-over]) while a file
// is over it, a "Choose file" affordance, the accepted types in a hint line, and
// a plain-language line when a dropped file isn't one this box takes.
//
// It is a <label> wrapping a visually-hidden (sr-only, still focusable) input,
// so clicking anywhere opens the picker and keyboard users Tab to it as before
// (a2-drop paints the focus ring through :has(input:focus-visible)). A drop and
// a click both call `onFiles` — the picker's ONE handler — with an array.
// ─────────────────────────────────────────────────────────────────────────────
import { FileText, Loader2, UploadCloud } from 'lucide-react'
import { useFileDrop } from '../../hooks/useFileDrop.js'
import '../../styles/pending/a2-carry.css'

export default function FileDropZone({
  onFiles,
  accept = '',
  multiple = false,
  disabled = false,
  busy = false,
  inputRef,
  title,
  hint,
  fileName,
  ariaLabel,
  acceptLabel,
  className = '',
  testId,
}) {
  // While busy (a preview or save in flight) the zone takes nothing — a stray
  // drop would start a second request whose answer overwrites the first's.
  const locked = disabled || busy
  const { dragging, dropProps, rejection, clearRejection } = useFileDrop({
    onFiles,
    accept,
    multiple,
    disabled: locked,
    acceptLabel,
  })

  return (
    <div className={className}>
      <label
        {...dropProps}
        data-testid={testId}
        className={`a2-drop flex-col items-center justify-center gap-1.5 px-6 py-6 text-center ${
          disabled ? 'cursor-not-allowed opacity-60' : busy ? 'cursor-wait' : 'cursor-pointer'
        }`}
      >
        <UploadCloud size={24} aria-hidden />
        {/* The title stays put while a file is over the box (a swap re-wraps it at
            narrow widths and shifts the box under the pointer); the one-line
            button carries the "release" cue instead. */}
        <span className="text-[15px] font-semibold text-ink">{title}</span>
        {fileName ? (
          <span className="flex min-w-0 max-w-full items-center gap-1.5 text-small text-ink">
            <FileText size={14} className="shrink-0 text-ink2" aria-hidden />
            <span className="min-w-0 truncate">{fileName}</span>
            {busy ? (
              <Loader2 size={14} className="shrink-0 motion-safe:animate-spin text-ink2" aria-label="Reading…" />
            ) : null}
          </span>
        ) : busy ? (
          <Loader2 size={16} className="motion-safe:animate-spin text-ink2" aria-label="Reading…" />
        ) : null}
        {/* Visual only — the label itself opens the picker. */}
        <span className="btn btn-secondary btn-sm mt-1" aria-hidden="true">
          {dragging ? 'Release to add it' : fileName ? 'Choose another' : multiple ? 'Choose files' : 'Choose file'}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={accept || undefined}
          multiple={multiple || undefined}
          disabled={locked}
          aria-label={ariaLabel ?? title}
          className="sr-only"
          onChange={(e) => {
            const list = Array.from(e.target.files ?? [])
            // Empty the input at once: a later DROP never updates it, so a
            // value left here would make re-choosing that same file a no-op
            // (no change event) and leave the input naming a stale file.
            // The visible name comes from the fileName prop.
            e.target.value = ''
            if (list.length === 0) return
            clearRejection()
            onFiles?.(multiple ? list : [list[0]])
          }}
        />
        {hint ? <span className="mt-1 text-[12px] text-ink2">{hint}</span> : null}
      </label>
      {rejection ? (
        <p role="alert" className="a2-note mt-2" data-tone="watch">
          {rejection}
        </p>
      ) : null}
    </div>
  )
}
