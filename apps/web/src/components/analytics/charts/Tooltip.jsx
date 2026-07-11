import { createContext, useContext, useEffect } from 'react'
import { ensureChartStyles } from './styles.js'

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip — the shared crosshair/hover tooltip for every chart. ONE instance:
// a single `.fr-viztip` element is lazily appended to <body> and reused by all
// charts (ported from the mockup's showTip/hideTip singleton). Charts read the
// controller via `useTooltip()`; wrapping in <TooltipProvider> is optional
// (the singleton works standalone, keeping the library self-contained).
//
// content: a plain string, OR { title?, rows: [{ color, label, value }] }.
// ─────────────────────────────────────────────────────────────────────────────

let tipNode = null

function ensureNode() {
  if (typeof document === 'undefined') return null
  if (tipNode) return tipNode
  ensureChartStyles()
  tipNode = document.createElement('div')
  tipNode.className = 'fr-viztip'
  tipNode.setAttribute('role', 'tooltip')
  document.body.appendChild(tipNode)
  return tipNode
}

function esc(v) {
  return String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function toHTML(content) {
  if (content == null) return ''
  if (typeof content === 'string') return esc(content)
  const { title, rows = [] } = content
  const head = title ? `<b>${esc(title)}</b>` : ''
  const body = rows
    .map(
      (r) =>
        `<div class="trow"><i style="background:${esc(r.color)}"></i>${esc(r.label)}<em>${esc(r.value)}</em></div>`,
    )
    .join('')
  return head + body
}

// The singleton controller (imperative, one DOM node — no per-chart tooltips).
export const tooltip = {
  show(content, x, y) {
    const n = ensureNode()
    if (!n) return
    n.innerHTML = toHTML(content)
    n.style.opacity = '1'
    const w = n.offsetWidth
    const vw = window.innerWidth
    n.style.left = Math.min(x + 14, vw - w - 10) + 'px'
    n.style.top = y + 14 + 'px'
  },
  hide() {
    if (tipNode) tipNode.style.opacity = '0'
  },
}

const TooltipContext = createContext(tooltip)

// Optional provider. The default context value is already the singleton, so charts
// work without it; the provider just guarantees the node exists eagerly and gives
// IA a seam to swap the controller if ever needed.
export function TooltipProvider({ children }) {
  useEffect(() => {
    ensureNode()
  }, [])
  return <TooltipContext.Provider value={tooltip}>{children}</TooltipContext.Provider>
}

export function useTooltip() {
  return useContext(TooltipContext)
}

export default TooltipProvider
