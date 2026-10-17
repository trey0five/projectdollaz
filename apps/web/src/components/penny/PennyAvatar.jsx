// ─────────────────────────────────────────────────────────────────────────────
// PennyAvatar — compatibility wrapper. "Penny" is the internal codename; the
// mascot the user sees is KYRO, drawn as "the Scholar" (scholar/ScholarOwl.jsx).
// Same default export and prop surface as before (size / state / facing /
// glance / blink / celebrate / active / speaking / listening / paused / perch)
// plus the Scholar's thinking / oops / mood / tone / confetti, so every call
// site compiles untouched. Change the mascot in scholar/, not here.
// ─────────────────────────────────────────────────────────────────────────────
import ScholarOwl from './scholar/ScholarOwl.jsx'

export default function PennyAvatar(props) {
  return <ScholarOwl {...props} />
}
