// ─────────────────────────────────────────────────────────────────────────────
// PENNY'S TOOLING KEEPS UP WITH THE PRODUCT.
//
// A month of shipping — AIC Phases A–K, enrollment intelligence, strategy,
// governance, continuous improvement — reached the app and never reached the
// assistant. Whole phases were invisible to her: she could CREATE improvement
// initiatives and not list one back, the entire Mock Visit had no tool at all,
// the student roster was unreachable, and `navigate_to_page` still offered the
// nine finance-era pages while ten more routes mounted around it.
//
// None of that was caught, because nothing compared the tool surface to the
// product. These do — mechanically, so the next module that ships either gets a
// tool or gets a red test, and "Penny doesn't know about that yet" stops being
// something a user discovers.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TOOL_SCHEMAS, TOOL_LABELS } from './assistant.tools.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const tools = readFileSync(HERE + 'assistant.tools.ts', 'utf8')
const service = readFileSync(HERE + 'assistant.service.ts', 'utf8')
const names = new Set(TOOL_SCHEMAS.map((t) => t.function.name))

/** The page keys `navigate_to_page` offers, read off the built schema. */
function navPages(): string[] {
  const nav = TOOL_SCHEMAS.find((t) => t.function.name === 'navigate_to_page')
  const props = nav?.function.parameters?.properties as
    | { page?: { enum?: string[] } }
    | undefined
  return props?.page?.enum ?? []
}

describe('every shipped module has a way in', () => {
  // Phase → the tool that answers it. A module with no row here is a module
  // Penny cannot discuss; a row whose tool is missing is a module she was told
  // about and cannot reach.
  const MODULE_TOOLS: [string, string][] = [
    ['strategic planning', 'get_plan_status'],
    ['governance', 'get_governance_status'],
    ['continuous improvement (AIC G)', 'get_improvement_status'],
    ['mock visit (AIC H)', 'get_visit_readiness'],
    ['early warnings (AIC E)', 'get_early_warnings'],
    ['superintendent portfolio (AIC I)', 'get_org_readiness_portfolio'],
    ['student roster', 'get_roster_summary'],
    ['HR registers (AIC F/K)', 'check_kyro_collects'],
  ]

  it.each(MODULE_TOOLS)('%s is reachable via %s', (_module, tool) => {
    expect(names, `${tool} is not a registered tool`).toContain(tool)
    expect(TOOL_LABELS[tool as keyof typeof TOOL_LABELS], `${tool} has no status label`).toBeTruthy()
  })

  it('each new read tool has a dispatch case — a schema with no handler is a dead tool', () => {
    for (const tool of ['get_improvement_status', 'get_visit_readiness', 'get_roster_summary']) {
      expect(service, `${tool} has no case in execute()`).toContain(`case '${tool}':`)
    }
  })

  it('the roster tool goes through the SERVICE, never the table', () => {
    // no-penny-pii keeps the delegate unreachable from this directory; this pins
    // the positive half — that the tool is wired to the aggregate at all.
    expect(service).toMatch(/this\.students\.aggregate\(/)
  })
})

describe('navigation reaches the whole product', () => {
  const pages = navPages()

  it('offers every module page that mounts, not the finance-era nine', () => {
    for (const page of [
      'governance',
      'accreditation',
      'improvement',
      'strategy',
      'hr',
      'enrollment',
      'facilities',
      'advancement',
      'tasks',
      'portfolio',
    ]) {
      expect(pages, `navigate_to_page cannot reach /${page}`).toContain(page)
    }
    // …without losing the ones that already worked.
    for (const page of ['home', 'data', 'statements', 'analytics', 'budget', 'readiness', 'reports', 'schedules', 'settings']) {
      expect(pages, `navigate_to_page lost /${page}`).toContain(page)
    }
  })

  it('start_walkthrough can pre-navigate to the SAME set — one vocabulary, two copies', () => {
    const wt = TOOL_SCHEMAS.find((t) => t.function.name === 'start_walkthrough')
    const steps = wt?.function.parameters?.properties as
      | { steps?: { items?: { properties?: { page?: { enum?: string[] } } } } }
      | undefined
    const wtPages = steps?.steps?.items?.properties?.page?.enum ?? []
    expect([...wtPages].sort()).toEqual([...pages].sort())
  })

  it('the RUNTIME allow-list matches the schema — the copy that made Penny apologise', () => {
    // Extending the tool schema alone is not enough. PAGE_KEYS gates the tool at
    // execution, so a page the model may name but the set rejects throws inside
    // runToolCall — and the model, seeing its own tool fail, tells the user the
    // page "isn't available". Live-caught: "take me to the strategy page" said
    // exactly that while /strategy sat mounted.
    const block = service.slice(service.indexOf('const PAGE_KEYS'), service.indexOf('const MODAL_KEYS'))
    for (const page of pages) expect(block, `PAGE_KEYS is missing '${page}'`).toContain(`'${page}'`)
    // …and the TYPE, which is what the navigate event is cast to.
    const typeBlock = service.slice(service.indexOf('type PageKey ='), service.indexOf('type SettingsSection ='))
    for (const page of pages) expect(typeBlock, `PageKey is missing '${page}'`).toContain(`'${page}'`)
  })

  it('the settings sections include alerts — a real route since Phase 4E', () => {
    const nav = TOOL_SCHEMAS.find((t) => t.function.name === 'navigate_to_page')
    const props = nav?.function.parameters?.properties as { section?: { enum?: string[] } }
    expect(props.section?.enum).toContain('alerts')
  })
})

describe('the system prompt teaches the tools that exist', () => {
  // The failure was never a missing tool alone — the model was not TOLD about
  // twenty of its own, so they were never called. Grep the prompt for the tools
  // a user asks for by name.
  // From the ROLE CLAUSE (defined just above the template) through the end of the
  // composed prompt — the viewer paragraph is part of what the model is told.
  const prompt = service.slice(
    service.indexOf('const roleClause ='),
    service.indexOf('private async resolvePeriod'),
  )

  it.each([
    'get_plan_status',
    'get_improvement_status',
    'get_governance_status',
    'get_early_warnings',
    'get_visit_readiness',
    'get_roster_summary',
  ])('names %s', (tool) => {
    expect(prompt, `the prompt never mentions ${tool}`).toContain(tool)
  })

  it('no longer claims the nine-page navigation vocabulary is "any page"', () => {
    expect(prompt).toMatch(/navigate_to_page takes the user to any page in the product/)
    expect(prompt).toContain('governance, accreditation, ')
  })

  it('the board (view-only) clause withholds capabilities by CATEGORY, not a stale list', () => {
    // The old clause enumerated six write kinds and went stale the moment strategy
    // and improvement shipped, so a board user asking "can you draft us an
    // improvement plan?" got no pre-emptive explanation.
    expect(prompt).toMatch(/that CREATES, CHANGES or IMPORTS anything DOES NOT APPLY/)
    expect(prompt).toMatch(/improvement initiatives or strategic plans/)
  })
})

describe('a Penny-created inspection counts as one', () => {
  it('create_maintenance_item can declare its complianceKind', () => {
    const t = TOOL_SCHEMAS.find((x) => x.function.name === 'create_maintenance_item')
    const props = t?.function.parameters?.properties as { complianceKind?: { enum?: string[] } }
    expect(props.complianceKind?.enum).toContain('fire_life_safety')
  })

  it('the schema tells the model NEVER to infer it from free text', () => {
    // The register published that promise; a tool description that omitted it
    // would invite exactly the guess the column was designed to prevent.
    const block = tools.slice(tools.indexOf("name: 'create_maintenance_item'"))
    expect(block.slice(0, 3000)).toMatch(/NEVER infer it from the title/)
  })

  it('it survives BOTH validation hops — proposal and apply', () => {
    const hops = service.match(/MAINTENANCE_COMPLIANCE_KINDS as readonly string\[\]\)\.includes/g) ?? []
    expect(hops.length).toBe(2)
  })
})

describe('a person can be named the way people name each other', () => {
  it('an assignee resolves by name or position, not only by email address', () => {
    expect(service).toMatch(/private async resolveMemberByNameOrTitle/)
    expect(service).toMatch(/const byPerson = await this\.resolveMemberByNameOrTitle/)
  })

  it('the TOOL SCHEMA tells the model it may pass a name or a position', () => {
    // Live-caught: the resolver accepted a position and the schema still said
    // "me or an email address", so the model asked the user for an email
    // instead of using a capability that was already there. A capability the
    // model is not told about does not exist.
    const t = TOOL_SCHEMAS.find((x) => x.function.name === 'create_task')
    const props = t?.function.parameters?.properties as { assignee?: { description?: string } }
    expect(props.assignee?.description).toMatch(/POSITION/)
    expect(props.assignee?.description).toMatch(/do NOT ask for an email address first/)
    const sfa = TOOL_SCHEMAS.find((x) => x.function.name === 'submit_for_approval')
    const sprops = sfa?.function.parameters?.properties as { approvers?: { description?: string } }
    expect(sprops.approvers?.description).toMatch(/position/i)
  })

  it('an ambiguous match is REFUSED, never guessed', () => {
    // Assigning accreditation work to the wrong colleague is the failure this
    // path exists to avoid; two people named Sam means we ask.
    expect(service).toMatch(/More than one active member of this school matches/)
  })
})
