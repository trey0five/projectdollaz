// PennyAttachmentChip — a single staged attachment shown above the input textarea
// (and, preview-only, inside a sent user bubble). Images render as a 60×60 thumb;
// spreadsheets/PDFs render as a wider file chip with a lucide icon, the filename,
// and a "will be analyzed" caption so the user knows Penny is going to read it.
//
// `attachment`: { local_id?, name, kind:'xlsx'|'csv'|'pdf'|'image', mime, preview?,
//                 dataBase64?, status? }
// `onRemove`: optional — when present an X button removes the chip (input row).
import { FileSpreadsheet, FileText, Image as ImageIcon, X } from 'lucide-react'

export default function PennyAttachmentChip({ attachment, onRemove }) {
  const { name, kind, preview } = attachment || {}
  const isImage = kind === 'image'

  if (isImage && preview) {
    return (
      <div className="group relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg border border-rule/70 bg-section shadow-sm">
        <img src={preview} alt={name || 'Attached image'} className="h-full w-full object-cover" />
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${name || 'image'}`}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-navy text-white shadow transition-colors hover:bg-navy-deep"
          >
            <X size={11} aria-hidden />
          </button>
        )}
      </div>
    )
  }

  // File chip (xlsx / csv / pdf, or an image without a preview).
  const Icon = kind === 'pdf' ? FileText : isImage ? ImageIcon : FileSpreadsheet
  return (
    <div className="group relative flex min-w-0 max-w-[220px] items-center gap-2 rounded-lg border border-rule/70 bg-white px-2.5 py-1.5 shadow-sm">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gold-gradient text-navy">
        <Icon size={15} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-medium text-navy">{name || 'Attachment'}</p>
        <p className="truncate text-[10px] text-muted">will be analyzed</p>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name || 'attachment'}`}
          className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-section hover:text-navy"
        >
          <X size={12} aria-hidden />
        </button>
      )}
    </div>
  )
}
