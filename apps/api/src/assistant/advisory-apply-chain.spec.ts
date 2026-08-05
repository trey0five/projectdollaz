import { describe, it, expect } from 'vitest'
import { APPLY_KINDS } from './dto/apply-action.dto.js'
import {
  REFRESH,
  REVERSIBLE_KINDS,
  CONFIRM_TOOLS,
  WRITE_TOOLS,
  type ProposedAction,
} from './assistant.service.js'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'
import { VISIBLE_HOLE_RULE_IDS } from '@finrep/compliance'
import { COVERAGE_REGISTRY } from './coverage-topics.js'
import { EVIDENCE_KIND_LABELS, evidenceKindLabel } from './evidence-kind-labels.js'

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 — THE APPLY CHAIN.
//
// This file is named in shipped comments (dto/apply-action.dto.ts and
// assistant.service.ts) as the proof that a new ProposedAction kind reaches all six
// touchpoints. IT DID NOT EXIST. A reviewer deleted BOTH Phase-J kinds from
// APPLY_KINDS and the entire api suite stayed green — a desync that 400s /apply at
// the global ValidationPipe before applyAction ever runs, and that has shipped twice
// in this repository, was defended by a comment referencing a file nobody wrote.
//
// THE TRICK THAT MAKES THIS CHEAP. `REFRESH` is declared
// `Record<ProposedAction['kind'], RefreshKey[]>` — a TOTAL Record, so the compiler
// already guarantees its keys are exactly the union's members. `Object.keys(REFRESH)`
// is therefore a RUNTIME enumeration of a TYPE, and every other touchpoint can be
// checked against it without reading a single source file.
//
// SEEN RED. Removing `'draft_improvement_plan'` from APPLY_KINDS reddens AC-1.1
// ("APPLY_KINDS and ProposedAction['kind'] name the same set", missing:
// draft_improvement_plan) and AC-1.2. Removing it from REVERSIBLE_KINDS reddens
// AC-1.4. Removing its TOOL_LABELS entry reddens AC-1.5. Removing it from REFRESH
// does not compile.
// ─────────────────────────────────────────────────────────────────────────────

const UNION_KINDS = Object.keys(REFRESH) as ProposedAction['kind'][]

/** The two kinds AIC Phase J added. Spelled out so this file names its subject. */
const PHASE_J_KINDS = ['draft_improvement_plan', 'attach_evidence'] as const

describe('AC-1 — a ProposedAction kind reaches every touchpoint', () => {
  it('AC-1.1 APPLY_KINDS and ProposedAction[kind] name the SAME set', () => {
    const inDto = new Set<string>(APPLY_KINDS)
    const inUnion = new Set<string>(UNION_KINDS)
    const missingFromDto = [...inUnion].filter((k) => !inDto.has(k))
    const missingFromUnion = [...inDto].filter((k) => !inUnion.has(k))
    expect(missingFromDto, `kinds in ProposedAction but not APPLY_KINDS (these 400 /apply)`).toEqual(
      [],
    )
    expect(missingFromUnion, `kinds in APPLY_KINDS but not ProposedAction`).toEqual([])
    // Not vacuous: the sets are non-trivially large.
    expect(inDto.size).toBeGreaterThan(20)
  })

  it('AC-1.2 both Phase-J kinds are in APPLY_KINDS, REFRESH and the union', () => {
    for (const kind of PHASE_J_KINDS) {
      expect(APPLY_KINDS as readonly string[], `${kind} missing from APPLY_KINDS`).toContain(kind)
      expect(Object.keys(REFRESH), `${kind} missing from REFRESH`).toContain(kind)
      expect(UNION_KINDS as readonly string[]).toContain(kind)
    }
  })

  it('AC-1.3 every REFRESH entry is a list, and the Phase-J writes refresh accreditation', () => {
    // Some kinds legitimately refresh nothing (invite_member touches no dashboard
    // surface), so the totality is the point, not a non-empty list.
    for (const [kind, keys] of Object.entries(REFRESH)) {
      expect(Array.isArray(keys), `${kind} has no refresh list`).toBe(true)
    }
    expect(REFRESH.draft_improvement_plan).toContain('accreditation')
    expect(REFRESH.draft_improvement_plan).toContain('strategy')
    expect(REFRESH.attach_evidence).toContain('accreditation')
  })

  it('AC-1.4 REVERSIBLE_KINDS is a subset of the union and contains the Phase-J writes', () => {
    for (const k of REVERSIBLE_KINDS) {
      expect(UNION_KINDS as readonly string[], `${k} is reversible but is not a kind`).toContain(k)
    }
    for (const kind of PHASE_J_KINDS) {
      expect([...REVERSIBLE_KINDS], `${kind} missing from REVERSIBLE_KINDS`).toContain(kind)
    }
  })

  it('AC-1.5 every CONFIRM_TOOLS entry is a registered tool WITH a status label', () => {
    const schemaNames = new Set(TOOL_SCHEMAS.map((t) => t.function.name))
    for (const tool of CONFIRM_TOOLS) {
      expect(schemaNames, `${tool} confirms but is not in TOOL_SCHEMAS`).toContain(tool)
      expect(TOOL_LABELS[tool as keyof typeof TOOL_LABELS], `no TOOL_LABELS entry for ${tool}`).toBeTruthy()
    }
    for (const tool of PHASE_J_KINDS) {
      expect([...CONFIRM_TOOLS], `${tool} is not confirm-then-apply`).toContain(tool)
    }
  })

  it('AC-1.7 every WRITE tool is a registered tool WITH a status label', () => {
    // THE REVERSE OF AC-1.5, and the direction that was missing. AC-1.5 walks
    // CONFIRM_TOOLS → schema; nothing walked the autonomous writes, so a write
    // tool with no schema entry (a tool the model can never call) or no label
    // (a silent spinner during a real mutation) passed every assertion here.
    const schemaNames = new Set(TOOL_SCHEMAS.map((t) => t.function.name))
    expect(WRITE_TOOLS.size).toBeGreaterThan(5)
    for (const tool of WRITE_TOOLS) {
      expect(schemaNames, `${tool} writes but is not in TOOL_SCHEMAS`).toContain(tool)
      expect(TOOL_LABELS[tool as keyof typeof TOOL_LABELS], `no TOOL_LABELS entry for ${tool}`).toBeTruthy()
    }
  })

  it('AC-1.8 every create_* kind is REVERSIBLE, or is on the named exception list', () => {
    // AC-1.4 checks REVERSIBLE_KINDS ⊆ union, which is the easy direction: it
    // cannot notice a create that FORGOT to be undoable. That is exactly how
    // import_diocesan_enrollment — a fan-out write across every school in an org —
    // shipped with no undo and no test said a word. A create that cannot be
    // reversed is a decision, so it is written down here rather than defaulted to.
    const IRREVERSIBLE_BY_DESIGN = new Set<string>([
      // Fans out across an ORG's schools and merges into existing snapshots; there
      // is no single row to delete, so undo would have to reconstruct prior state.
      'import_diocesan_enrollment',
    ])
    // `create_*` plus the two plan DRAFTERS, which mint whole trees of records.
    // NOT every `draft_*`: draft_cap_entry fills a field on a corrective-action
    // row that already exists, so there is nothing for an undo to delete — an
    // update is not a create, and the distinction is the point of this list.
    const creates = UNION_KINDS.filter((k) => k.startsWith('create_') || /^draft_.*_plan$/.test(k))
    expect(creates.length).toBeGreaterThan(8)
    for (const kind of creates) {
      if (IRREVERSIBLE_BY_DESIGN.has(kind)) continue
      expect([...REVERSIBLE_KINDS], `${kind} creates a record but has no undo`).toContain(kind)
    }
    // The exception list may not rot into a place kinds go to be forgotten.
    for (const kind of IRREVERSIBLE_BY_DESIGN) {
      expect(UNION_KINDS as readonly string[], `${kind} is exempted but is not a kind`).toContain(kind)
    }
  })

  it('AC-1.6 the seven Phase-J tools are all registered with a label', () => {
    const schemaNames = new Set(TOOL_SCHEMAS.map((t) => t.function.name))
    for (const tool of [
      'check_kyro_collects',
      'explain_readiness_change',
      'generate_readiness_narrative',
      'suggest_evidence',
      'compare_accreditation_peers',
      'get_org_readiness_portfolio',
      'draft_improvement_plan',
      'attach_evidence',
    ]) {
      expect(schemaNames, `${tool} is not registered`).toContain(tool)
      expect(TOOL_LABELS[tool as keyof typeof TOOL_LABELS], `${tool} has no label`).toBeTruthy()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TL-1 — A REFUSAL CARRIES NOTHING TO IMPROVISE FROM.
//
// The tool DESCRIPTIONS are the other half of the contract, and one of them
// contradicted the system prompt: generate_readiness_narrative told the model to
// "render them in the order returned", i.e. to reproduce the guarded segments into
// chat prose, where PennyMessage markdown-transforms them and nothing on screen
// distinguishes them from the card.
// ─────────────────────────────────────────────────────────────────────────────

const descOf = (name: string): string =>
  TOOL_SCHEMAS.find((t) => t.function.name === name)?.function.description ?? ''

describe('TL-1 — the advisory tools tell the model the SAME thing', () => {
  it('both card-bearing tools say: introduce it in one digit-free sentence', () => {
    // RED PROOF: restore "render them in the order returned and never re-word" to
    // generate_readiness_narrative's description — the second pair reddens.
    for (const tool of ['explain_readiness_change', 'generate_readiness_narrative']) {
      const d = descOf(tool)
      expect(d, `${tool} does not mention the card`).toMatch(/card/i)
      expect(d, `${tool} does not forbid digits in the introduction`).toMatch(/no digits/i)
    }
  })

  it('neither instructs the model to render the segments itself', () => {
    for (const tool of ['explain_readiness_change', 'generate_readiness_narrative']) {
      expect(descOf(tool), `${tool} tells the model to render the segments`).not.toMatch(
        /render them in the order returned/i,
      )
    }
  })

  it('the peer tool names its two ranks apart and says which way each runs', () => {
    // RED PROOF: revert the description to "report the rank" — the direction
    // assertions redden. Two opposite scales were both called "rank" in one payload.
    const d = descOf('compare_accreditation_peers')
    expect(d).toMatch(/peerRank/)
    expect(d).toMatch(/orgAttentionRank/)
    expect(d).toMatch(/opposite directions/i)
    // It must no longer promise an anonymisation the code cannot produce.
    expect(d).not.toMatch(/Peer A/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE CAPABILITY REGISTRY — coverage-topics.ts had no test at all, and it retyped
// three rule ids that @finrep/compliance owns. `wouldEnable` is now TYPED against
// VISIBLE_HOLE_RULE_IDS (a Phase-K change that fills one of those holes stops
// compiling here); this asserts the same thing at runtime, plus the §0 substitution
// the scope note freezes.
// ─────────────────────────────────────────────────────────────────────────────

describe('CR-1 — the capability registry names only holes the twin actually ships', () => {
  it('every wouldEnable is a VISIBLE_HOLE_RULE_ID', () => {
    const visible = new Set<string>(VISIBLE_HOLE_RULE_IDS)
    const named = Object.values(COVERAGE_REGISTRY)
      .map((e) => ('wouldEnable' in e ? e.wouldEnable : null))
      .filter((v): v is NonNullable<typeof v> => typeof v === 'string')
    expect(named.length).toBeGreaterThan(0)
    for (const id of named) {
      expect(visible, `${id} is named as a hole the twin does not publish`).toContain(id)
    }
  })

  it('THE §0 SUBSTITUTION: teacher evaluations are ANSWERED, not refused', () => {
    // Phase F shipped the StaffEvaluation register. Refusing this question would be
    // Penny denying a capability the product has — the same failure as inventing one.
    const t = COVERAGE_REGISTRY.teacher_evaluations
    expect(t.collected).toBe(true)
    expect('moduleKey' in t ? t.moduleKey : null).toBe('hr')
  })

  it('professional development and safe-environment clearances are now ANSWERED', () => {
    // AIC Phase K built both registers, so Penny must no longer deny them — the
    // exact failure Phase J's tripwire exists to prevent, and the one Phase F
    // nearly shipped in the other direction. Each names the register it reads.
    for (const [key, register] of [
      ['professional_development', 'professional_development'],
      ['safe_environment_clearances', 'clearances'],
    ] as const) {
      const e = COVERAGE_REGISTRY[key]
      expect(e.collected, key).toBe(true)
      expect('register' in e ? e.register : null, key).toBe(register)
      expect('moduleKey' in e ? e.moduleKey : null, key).toBe('hr')
    }
  })

  it('learning growth is the ONLY not-collected topic left with a rule behind it', () => {
    // Derived, so closing another hole without updating Penny fails HERE.
    const refusals = Object.values(COVERAGE_REGISTRY)
      .filter((e) => e.collected === false && 'wouldEnable' in e && e.wouldEnable)
      .map((e) => (e as { wouldEnable: string }).wouldEnable)
    expect([...new Set(refusals)].sort()).toEqual(['ACAD-GROWTH-FLAT'])
  })

  it('a not-collected message names its own wouldEnable rule, so nothing drifts silently', () => {
    for (const e of Object.values(COVERAGE_REGISTRY)) {
      if (e.collected !== false) continue
      if (!('wouldEnable' in e) || !e.wouldEnable) continue
      expect(e.message, `${e.topic}'s message does not name ${e.wouldEnable}`).toContain(
        e.wouldEnable,
      )
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AE-1 (label half) — evidence-kind-labels.ts cited a suggest-evidence.spec.ts that
// does not exist. The invariant it claimed is asserted here instead: every frozen
// tag has a label, and an unknown tag NEVER produces a filename.
// ─────────────────────────────────────────────────────────────────────────────

describe('EK-1 — naming a KIND of artifact never names a FILE', () => {
  it('every frozen tag has a label', () => {
    for (const [tag, label] of Object.entries(EVIDENCE_KIND_LABELS)) {
      expect(typeof label, `${tag} has no label`).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    }
  })

  it('an unknown tag falls back to the tag itself, never to an invented title', () => {
    const out = evidenceKindLabel('some-tag-nobody-seeded')
    expect(out).toContain('some-tag-nobody-seeded')
    expect(out).not.toMatch(/\.(pdf|docx?|xlsx?|png|jpe?g)\b/i)
  })

  it('no label reads like a filename', () => {
    for (const label of Object.values(EVIDENCE_KIND_LABELS)) {
      expect(label, `${label} looks like a file`).not.toMatch(/\.(pdf|docx?|xlsx?|png|jpe?g)\b/i)
    }
  })
})
