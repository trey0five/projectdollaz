// studioRecipes — curated multi-step "guided workflows" for the Penny Studio
// landing. Each recipe is one tap that sends a rich, STRUCTURED directive through
// the normal chat.send path; Penny performs the steps in order with her existing
// tools, pausing to show results for approval (confirm-then-apply keeps writes
// safe). `steps` are the short human labels shown on the card; `prompt` is what
// Penny actually receives. Shape mirrors studioTiles.js.
import { CalendarCheck, Presentation, CalendarPlus, ListChecks, Clock3 } from 'lucide-react'

export const STUDIO_RECIPES = [
  {
    id: 'monthly-close',
    Icon: CalendarCheck,
    title: 'Monthly close',
    description: 'Run this month end to end — statements, review flags, and a variance recap.',
    steps: [
      "Confirm this month's trial balance is imported",
      'Generate the statements',
      'Flag any uncategorized accounts',
      "Summarize the month's variances",
    ],
    prompt:
      "Run a monthly close for me, one step at a time. First, confirm my latest trial balance is imported for the current period — tell me if it's missing and exactly what to drop. Then generate or refresh the financial statements. Next, list any accounts still flagged 'to review' that aren't flowing into a statement line. Finally, give me a short plain-language summary of what changed this month versus last month. Do each step in order and show me the result before saving anything.",
  },
  {
    id: 'board-prep',
    Icon: Presentation,
    title: 'Board meeting prep',
    description: 'Get ready for the finance committee — packet, narrative, and decisions.',
    steps: [
      'Assemble the board packet',
      "Draft the treasurer's narrative",
      'List the decisions needed',
      'Note follow-ups',
    ],
    prompt:
      "Help me prepare for the next board / finance-committee meeting, step by step. First, assemble a board-ready finance summary for the current period. Then draft a short treasurer's narrative I can read aloud. Next, list the decisions the board needs to make. Finally, note any follow-ups to track. Show me each draft to approve before finalizing anything.",
  },
  {
    id: 'new-fiscal-year',
    Icon: CalendarPlus,
    title: 'New fiscal year setup',
    description: 'Start the new year right — open the period, roll the budget, know what to import.',
    steps: ['Open the new fiscal year', 'Roll the budget forward', 'Tell me what to import'],
    prompt:
      'Help me set up the new fiscal year, walking me through it step by step. Explain which period I should create to open the new fiscal year (our fiscal year runs July–June). Then explain how to roll last year’s budget forward as a starting point. Finally, tell me exactly which files I need to drop and where. Go one step at a time and confirm with me before changing anything.',
  },
  {
    id: 'data-cleanup',
    Icon: ListChecks,
    title: 'Data cleanup',
    description: 'Tidy the books — categorize stragglers and confirm everything balances.',
    steps: ['Find uncategorized accounts', 'Map them like last quarter', 'Check the books balance'],
    prompt:
      "Clean up my data quality, step by step. First, find the accounts still flagged 'to review' that aren't mapped to a statement line. Then propose mappings consistent with how I categorized similar accounts in prior periods. Finally, confirm the trial balance still balances after the changes. Show me everything before saving.",
  },
  {
    id: 'catch-up',
    Icon: Clock3,
    title: 'Catch up after time away',
    description: 'Back from a break? Get the briefing, what changed, and what needs you.',
    steps: ['Pull the latest briefing', 'Summarize what changed', 'Surface what needs a decision'],
    prompt:
      'Catch me up after some time away. First, give me the prioritized briefing across every area of the school. Then summarize what has changed since I was last here. Finally, list what needs a decision from me today, most urgent first.',
  },
]
