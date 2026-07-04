// studioTiles — the capability grid on the Penny Studio landing. Each tile either
// PREFILLS the ask bar (so the user can tweak before sending) or SENDS straight
// into a conversation. Prompts are written for Penny's server tools; `ownerOnly`
// hides the governance-create tile from read-only members (the server refuses it
// anyway — this just avoids the dead-end affordance).
import { LayoutGrid, Clock3, FileText, ListTree, LineChart, ShieldPlus } from 'lucide-react'

export const STUDIO_TILES = [
  {
    id: 'statements',
    Icon: LayoutGrid,
    title: 'Build my statements',
    blurb: 'Turn a trial balance into a full set of financials.',
    cta: 'Start',
    mode: 'prefill',
    prompt: 'Turn my latest trial balance into a full set of financial statements.',
  },
  {
    id: 'catch-up',
    Icon: Clock3,
    title: 'Catch me up',
    blurb: 'A prioritized briefing across all 8 areas of the school.',
    cta: 'Brief me',
    mode: 'send',
    prompt: 'Brief me on what needs my attention across every area of the school today.',
  },
  {
    id: 'board-report',
    Icon: FileText,
    title: 'Draft a board report',
    blurb: 'A board-ready packet with narrative, written for you.',
    cta: 'Draft it',
    mode: 'send',
    prompt: 'Draft a board-ready finance packet with a written narrative for the current period.',
  },
  {
    id: 'categorize',
    Icon: ListTree,
    title: 'Categorize my accounts',
    blurb: 'Map the accounts still flagged “to review.”',
    cta: 'Clean up',
    mode: 'send',
    prompt:
      'Map the accounts still flagged “to review” the way I did last quarter, and show me before saving.',
  },
  {
    id: 'ask-numbers',
    Icon: LineChart,
    title: 'Ask about my numbers',
    blurb: '“How’s cash vs last year?” — answered with a chart.',
    cta: 'Ask',
    mode: 'prefill',
    prompt: 'How does our cash compare to last year?',
  },
  {
    id: 'governance',
    Icon: ShieldPlus,
    title: 'Add to governance',
    blurb: 'Log a policy, committee, meeting, or standard by voice.',
    cta: 'Add',
    mode: 'prefill',
    prompt: 'Log a new policy in governance:',
    ownerOnly: true,
  },
]
