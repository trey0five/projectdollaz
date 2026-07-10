// UiFlagContext — the ui.v2 redesign flag. Applied to <html data-ui> synchronously in
// main.jsx (before mount, no FOUC); this context just exposes it to React + lets the
// Settings toggle flip it (persists to localStorage, then hard-reloads for a clean swap).
import { createContext, useContext } from 'react'

export const UI_FLAG_KEY = 'finrep.ui'
export function readUiV2() {
  try {
    const q = new URLSearchParams(window.location.search).get('ui')
    if (q === 'v2') { localStorage.setItem(UI_FLAG_KEY, 'v2'); return true }
    if (q === 'v1') { localStorage.setItem(UI_FLAG_KEY, 'v1'); return false }
    return localStorage.getItem(UI_FLAG_KEY) === 'v2'
  } catch { return false }
}
const Ctx = createContext(false)
export function UiFlagProvider({ children }) {
  return <Ctx.Provider value={readUiV2()}>{children}</Ctx.Provider>
}
export function useUiV2() { return useContext(Ctx) }
export function setUiV2(on) {
  try { localStorage.setItem(UI_FLAG_KEY, on ? 'v2' : 'v1') } catch { /* storage unavailable */ }
  window.location.reload()
}
