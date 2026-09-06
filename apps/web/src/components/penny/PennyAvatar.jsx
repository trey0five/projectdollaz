// ─────────────────────────────────────────────────────────────────────────────
// PennyAvatar — compatibility wrapper. "Penny" is the internal codename; the
// mascot the user sees is KYRO the dove (KyroDove.jsx). Same default export and
// prop surface as the old gold coin (size / glance / blink / celebrate / active /
// speaking / listening) plus the dove's `state` / `facing` / `paused`, so every
// existing call site compiles untouched. Change the mascot in KyroDove, not here.
// ─────────────────────────────────────────────────────────────────────────────
import KyroDove from './KyroDove.jsx'

export default function PennyAvatar(props) {
  return <KyroDove {...props} />
}
