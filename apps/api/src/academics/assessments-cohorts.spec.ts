import 'reflect-metadata'
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { AssessmentsService } from './assessments.service.js'
import { AcademicsController } from './academics.controller.js'
import { CohortQueryDto } from './dto/academics.dto.js'
import { ROLES_KEY } from '../common/decorators/roles.decorator.js'
import { REQUIRES_MODULE } from '../billing/requires-module.decorator.js'

const here = dirname(fileURLToPath(import.meta.url))
const serviceSource = readFileSync(join(here, 'assessments.service.ts'), 'utf-8')
const orgControllerSource = readFileSync(join(here, 'academics-org.controller.ts'), 'utf-8')

/**
 * THE COHORT READ — what the browser is allowed to be told.
 *
 * The engine's own suite proves the arithmetic. These assert the things only
 * the service decides: which grades a panel set may contain, which year a
 * cohort ends in, whether a peer's name can reach the wire, and that the two
 * scopes describe the SAME cohorts rather than two different screens.
 */

interface RawRow {
  schoolId: string
  schoolYear: number
  testType: string
  gradeLevel: string
  avgComposite: number | null
  testedCount: number | null
  sectionAverages?: Record<string, number> | null
}

const SCHOOLS = [
  { id: 'focus', name: 'Saint Agnes School', gradeLow: '3', gradeHigh: '8', schoolType: 'elementary' },
  { id: 'peer', name: 'Holy Rosary Academy', gradeLow: '3', gradeHigh: '8', schoolType: 'elementary' },
  { id: 'high', name: 'Central Catholic High', gradeLow: '9', gradeHigh: '12', schoolType: 'high' },
]

function rowsFor(schoolId: string, years: number[], grades: string[], base: number): RawRow[] {
  const out: RawRow[] = []
  for (const schoolYear of years) {
    for (const gradeLevel of grades) {
      out.push({
        schoolId,
        schoolYear,
        testType: 'terranova',
        gradeLevel,
        avgComposite: base + (schoolYear - years[0]) * 2,
        testedCount: 40,
        sectionAverages: { reading: base + 10, language: base + 4, math: base - 6, science: base, socialStudies: base },
      })
    }
  }
  return out
}

const YEARS = [2023, 2024, 2025, 2026]
const GRADES = ['3', '4', '5', '6', '7', '8']
const NETWORK: RawRow[] = [
  ...rowsFor('focus', YEARS, GRADES, 60),
  ...rowsFor('peer', YEARS, GRADES, 72),
  ...rowsFor('high', YEARS, ['9', '10', '11', '12'], 55),
]

/** Only the collaborators these two methods touch; the rest is the e2e path. */
function svc(rows: RawRow[]) {
  const prisma = {
    school: {
      findUnique: ({ where }: { where: { id: string } }) => {
        const s = SCHOOLS.find((x) => x.id === where.id)
        return Promise.resolve(s ? { ...s, organizationId: 'org-1' } : null)
      },
      findMany: () => Promise.resolve(SCHOOLS.map((s) => ({ id: s.id }))),
    },
    assessmentSchoolAggregate: {
      findMany: ({ where }: { where: Record<string, { in?: string[] } | string> }) => {
        const ids = (where.schoolId as { in?: string[] })?.in ?? null
        const testType = typeof where.testType === 'string' ? where.testType : null
        return Promise.resolve(
          rows
            .filter((r) => (ids === null || ids.includes(r.schoolId)) && (testType === null || r.testType === testType))
            .map((r) => ({
              ...r,
              derivation: 'ingested',
              scoreType: 'percentile',
              eligibleCount: null,
              benchmarkMetCount: null,
              benchmarkTestedCount: null,
              benchmarkRates: null,
              distribution: null,
              school: { name: SCHOOLS.find((s) => s.id === r.schoolId)?.name },
            })),
        )
      },
    },
  }
  const instance = Object.create(AssessmentsService.prototype) as AssessmentsService
  ;(instance as unknown as { prisma: unknown }).prisma = prisma
  return instance
}

/**
 * THE FROZEN SEAM, written down. The web is built against exactly this shape,
 * so declaring it here means a field quietly renamed in the service fails a
 * test rather than a chart.
 */
interface WireLeg {
  schoolYear: number
  gradeLevel: string
  gradeRank: number
  value: number | null
  tested: number | null
  state: 'observed' | 'suppressed' | 'not-reported' | 'missing'
}
interface WireLine {
  cohortId: number
  schoolId: string | null
  schoolName?: string
  label: string
  isFocus: boolean
  startGrade: string
  endGrade: string
  legs: WireLeg[]
  observedLegs: number
  complete: boolean
  netChange: number | null
  netChangeUnavailable: string | null
  direction: 'gained' | 'declined' | 'held' | 'unknown'
  observedChange: { value: number; fromGrade: string; toGrade: string; spanGrades: number } | null
}
interface WirePanel {
  key: string
  cohortId: number
  label: string
  startGrade: string
  endGrade: string
  startYear: number
  endYear: number
  grades: string[]
  years: number[]
  focus: WireLine
  peers: WireLine[]
  summary: { legs: Array<{ value: number | null; weighting: string }>; change: number | null } | null
}
interface WireContext {
  endYear: number | null
  years: number[]
  testType: string
  family: string
  scoreType: string
  scoreRange: { min: number; max: number }
  nationalReference: number | null
  materialGap: number
  seriesBasis: string
  weighting: string
  window: number
  requestedWindow: number
  availableWindows: number[]
  scope: string
  peerCount: number
  peersAvailable: number
  series: string
  availableSeries: Array<{ key: string; label: string }>
  gradeSpan: {
    low: number | null
    high: number | null
    lowGrade: string | null
    highGrade: string | null
    gradesOnFile: string[]
    gradeDepth: number
    yearDepth: number
    maxWindow: number
    windows: number[]
    fromProfile: { gradeLow: string | null; gradeHigh: string | null }
  }
  truncated: boolean
  panelsAvailable: number
  reason: string | null
}
interface WirePayload {
  empty: boolean
  school: { id: string; name: string; level: string }
  context: WireContext
  panels: WirePanel[]
  matrix: { seriesBasis: string; cohorts: unknown[]; series: unknown[]; cells: unknown[] } | null
  availableCohorts: unknown[]
  hidePeerNames: boolean
}

/** What the browser actually receives — undefined and class instances gone. */
async function wire(promise: Promise<unknown>): Promise<WirePayload> {
  return JSON.parse(JSON.stringify(await promise)) as WirePayload
}

// ── 15-16: THE PANEL SET IS THE FOCUS SCHOOL'S, IN BOTH SCOPES ───────────────

describe('cohorts — the panel set belongs to the school, not to the diocese', () => {
  it('(15) a 3-8 school inside a K-12 org is never offered a high-school cohort', async () => {
    const payload = await wire(svc(NETWORK).cohorts('focus', { window: 4 }))
    expect(payload.empty).toBe(false)
    expect(payload.panels.length).toBeGreaterThan(0)
    expect(payload.panels.map((p) => `${p.startGrade}→${p.endGrade}`)).toEqual(['3→6', '4→7', '5→8'])
    // The high school's grades are in the same org and the same query.
    expect(payload.panels.some((p) => Number(p.endGrade) > 8)).toBe(false)
    expect(payload.context.gradeSpan.low).toBe(3)
    expect(payload.context.gradeSpan.high).toBe(8)
    expect(payload.context.gradeSpan.fromProfile).toEqual({ gradeLow: '3', gradeHigh: '8' })
    // School scope is the default and it means ONE school.
    expect(payload.context.scope).toBe('school')
    expect(payload.context.peerCount).toBe(0)
    expect(payload.panels.every((p) => Array.isArray(p.peers) && p.peers.length === 0)).toBe(true)
    expect(payload.panels.every((p) => p.summary === null)).toBe(true)
  })

  it('says there ARE peers to compare with even when none were drawn', async () => {
    // THE REGRESSION THAT HID THE CONTROL. The compare toggle was gated on
    // peerCount, which counts the peer LINES BUILT — and in the default school
    // scope that is always zero, so a school with two siblings in its diocese
    // was shown no toggle at all and the whole feature was reachable only by
    // hand-typing ?peers=1. peersAvailable is scope-INDEPENDENT: the other
    // readable schools in the org, drawn or not.
    const school = await wire(svc(NETWORK).cohorts('focus', { window: 4, scope: 'school' }))
    expect(school.context.scope).toBe('school')
    expect(school.context.peerCount).toBe(0)
    expect(school.context.peersAvailable).toBe(2) // 'peer' and 'high' — never 'focus' itself

    // And it does not move when the scope does: the same organisation either way.
    const org = await wire(svc(NETWORK).cohorts('focus', { window: 4, scope: 'org' }))
    expect(org.context.peersAvailable).toBe(2)
    expect(org.context.peerCount).toBe(1) // only the one that shares a 3-8 cohort
  })

  it('(16) switching to org scope adds peer LINES and changes nothing else', async () => {
    const school = await wire(svc(NETWORK).cohorts('focus', { window: 4, scope: 'school' }))
    const org = await wire(svc(NETWORK).cohorts('focus', { window: 4, scope: 'org' }))

    expect(org.panels.map((p) => p.key)).toEqual(school.panels.map((p) => p.key))
    expect(org.context.gradeSpan).toEqual(school.context.gradeSpan)
    // The focus line is byte-identical; only peers were added beside it.
    expect(org.panels.map((p) => p.focus)).toEqual(school.panels.map((p) => p.focus))
    expect(org.context.peerCount).toBe(1) // the other 3-8 school; the high school has no such cohort
    expect(org.panels[0].peers.map((t) => t.schoolId)).toEqual(['peer'])
    const summary = org.panels[0].summary
    expect(summary).not.toBeNull()
    expect(summary?.legs).toHaveLength(4)
    expect(summary?.legs[0].weighting).toBe('tester-weighted')
  })

  it('the invariants a chart cannot recover from hold on the SERIALIZED payload', async () => {
    const payload = await wire(svc(NETWORK).cohorts('focus', { window: 4, scope: 'org' }))
    for (const panel of payload.panels) {
      for (const line of [panel.focus, ...panel.peers]) {
        // 1. Always `window` legs — a gap keeps its slot.
        expect(line.legs).toHaveLength(payload.context.window)
        // 2. Ascending by grade rank, never by label.
        const ranks = line.legs.map((l) => l.gradeRank)
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
        // 3. Direction is decided here, not from the sign of the change.
        expect(['gained', 'declined', 'held', 'unknown']).toContain(line.direction)
        // 5. Net change is null exactly when an ENDPOINT is empty.
        const endpointsObserved = line.legs[0].value !== null && line.legs[line.legs.length - 1].value !== null
        expect(line.netChange === null).toBe(!endpointsObserved)
        expect(line.netChangeUnavailable === null).toBe(endpointsObserved)
        // The peer key: schoolId is nullable, `label` is not.
        expect(typeof line.label).toBe('string')
      }
    }
    expect(payload.context.seriesBasis).toBe('reported-composite')
    expect(payload.matrix).not.toBeNull()
    expect(payload.matrix?.seriesBasis).toBe('reported-composite')
  })
})

// ── 17: ANONYMISATION HAPPENS BEFORE THE WIRE ────────────────────────────────

describe('cohorts — hiding peer names is a server decision', () => {
  it('(17) no peer name survives serialisation, and the focus school keeps its own', async () => {
    const payload = await wire(svc(NETWORK).cohorts('focus', { window: 4, scope: 'org', hidePeerNames: true }))
    expect(payload.hidePeerNames).toBe(true)
    const text = JSON.stringify(payload)
    expect(text).not.toContain('Holy Rosary Academy')
    expect(text).toContain('Saint Agnes School')

    for (const panel of payload.panels) {
      expect(panel.focus.schoolId).toBe('focus')
      expect(panel.focus.schoolName).toBe('Saint Agnes School')
      expect(panel.focus.label).toBe('Saint Agnes School')
      for (const peer of panel.peers) {
        expect(peer.schoolId).toBeNull()
        expect(peer.schoolName).toMatch(/^School \d+$/)
        // The web keys peer lines on `label`, so it must be rewritten too.
        expect(peer.label).toBe(peer.schoolName)
        // A peer line is still a full trajectory — anonymised, not truncated.
        expect(peer.legs).toHaveLength(payload.context.window)
      }
    }
  })

  it('names ride along when the caller did not ask for them to be hidden', async () => {
    const payload = await wire(svc(NETWORK).cohorts('focus', { window: 4, scope: 'org' }))
    expect(payload.hidePeerNames).toBe(false)
    expect(payload.panels[0].peers[0].schoolName).toBe('Holy Rosary Academy')
  })
})

// ── 18: ECHO-BACK ────────────────────────────────────────────────────────────

describe('cohorts — every control reflects what the SERVER used', () => {
  it('(18) a series this family does not have falls back to the composite and says so', async () => {
    const payload = await wire(svc(NETWORK).cohorts('focus', { window: 4, series: 'erw' }))
    expect(payload.context.series).toBe('total')
    expect(payload.context.availableSeries[0]).toEqual({ key: 'total', label: 'Total Battery' })
    expect(payload.context.availableSeries.map((s) => s.key)).toEqual([
      'total',
      'reading',
      'language',
      'math',
      'science',
      'socialStudies',
    ])
    const reading = await wire(svc(NETWORK).cohorts('focus', { window: 4, series: 'reading' }))
    expect(reading.context.series).toBe('reading')
    // Total Battery is the REPORTED composite, never the mean of the subjects.
    expect(reading.panels[0].focus.legs[0].value).toBe(70)
    expect(payload.panels[0].focus.legs[0].value).toBe(60)
  })

  it('the window is clamped to what the school’s grades support, and the options say which', async () => {
    const twoGrades = rowsFor('focus', YEARS, ['7', '8'], 60)
    const payload = await wire(svc(twoGrades).cohorts('focus', { window: 4 }))
    expect(payload.context.window).toBe(2)
    expect(payload.context.availableWindows).toEqual([2])
    expect(payload.panels).toHaveLength(1)
    expect(payload.panels[0].focus.legs).toHaveLength(2)
  })

  it('the end year is the latest year the school REPORTED, not the latest row', async () => {
    // A next-year row exists but is empty — mid-year, this is the normal state.
    const midYear = [
      ...rowsFor('focus', YEARS, GRADES, 60),
      ...GRADES.map((gradeLevel) => ({
        schoolId: 'focus',
        schoolYear: 2027,
        testType: 'terranova',
        gradeLevel,
        avgComposite: null,
        testedCount: null,
      })),
    ]
    const payload = await wire(svc(midYear).cohorts('focus', { window: 4 }))
    expect(payload.context.years[0]).toBe(2027)
    expect(payload.context.endYear).toBe(2026)
    expect(payload.panels[0].focus.legs[3].schoolYear).toBe(2026)
    expect(payload.panels[0].focus.legs[3].value).not.toBeNull()
  })

  it('the panel cap reports the cohorts it dropped rather than implying there were none', async () => {
    const k12 = rowsFor('focus', YEARS, ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], 60)
    const payload = await wire(svc(k12).cohorts('focus', { window: 2 }))
    expect(payload.context.panelsAvailable).toBe(12)
    expect(payload.context.truncated).toBe(false)
    expect(payload.panels).toHaveLength(12)
    // …and the highest end grades are the ones kept.
    expect(payload.panels[payload.panels.length - 1].endGrade).toBe('12')
  })
})

// ── 21: THE EMPTY STATE ──────────────────────────────────────────────────────

describe('cohorts — nothing on file is a 200 with a reason, not an error', () => {
  it('(21) an empty school answers with the shape the view expects', async () => {
    const payload = await wire(svc([]).cohorts('focus', { window: 4 }))
    expect(payload.empty).toBe(true)
    expect(payload.panels).toEqual([])
    expect(payload.matrix).toBeNull()
    expect(payload.context.availableWindows).toEqual([])
    expect(payload.context.gradeSpan.maxWindow).toBe(0)
    expect(payload.context.panelsAvailable).toBe(0)
    expect(typeof payload.context.reason).toBe('string')
    expect(payload.school.name).toBe('Saint Agnes School')
    expect(payload.availableCohorts).toEqual([])
  })

  it('a school with grades but no followable cohort says which, and still returns panels:[]', async () => {
    const oneGrade = rowsFor('focus', YEARS, ['5'], 60)
    const payload = await wire(svc(oneGrade).cohorts('focus', { window: 4 }))
    expect(payload.empty).toBe(false)
    expect(payload.panels).toEqual([])
    expect(payload.context.reason).toContain('one grade')
  })
})

// ── THE DIOCESAN TWIN ────────────────────────────────────────────────────────

describe('cohorts — the org console cuts its panels for one school', () => {
  it('defaults to the school with the most results on file, and shows peers', async () => {
    const payload = await wire(svc(NETWORK).orgCohorts('org-1', { window: 4 }))
    // 'focus' and 'peer' tie on row count; the tie breaks on id, deterministically.
    expect(payload.school.id).toBe('focus')
    expect(payload.context.scope).toBe('org')
    expect(payload.context.peerCount).toBe(1)
    expect(payload.panels.map((p) => p.label)).toEqual(['Grades 3 → 6', 'Grades 4 → 7', 'Grades 5 → 8'])
  })

  it('honours the caller’s pick — and the panels reshape to THAT school’s grades', async () => {
    const payload = await wire(svc(NETWORK).orgCohorts('org-1', { window: 4, focusSchoolId: 'high' }))
    expect(payload.school.id).toBe('high')
    expect(payload.panels.map((p) => p.label)).toEqual(['Grades 9 → 12'])
    expect(payload.context.gradeSpan.low).toBe(9)
    // The 3-8 schools are in scope but share no cohort with a high school.
    expect(payload.panels[0].peers).toEqual([])
  })

  it('refuses a school from another organization rather than reading across the tenant line', async () => {
    await expect(svc(NETWORK).orgCohorts('org-1', { focusSchoolId: 'somebody-else' })).rejects.toThrow(
      /not in this organization/i,
    )
  })
})

// ── 19-20: THE DOOR ──────────────────────────────────────────────────────────

describe('cohorts — the query and the guards', () => {
  const parse = (q: Record<string, unknown>) =>
    validateSync(plainToInstance(CohortQueryDto, q, { enableImplicitConversion: false }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })

  it('(19) a window the engine cannot honour is a 400, not a silent clamp', () => {
    expect(parse({ window: '4' })).toHaveLength(0)
    expect(parse({ window: '2' })).toHaveLength(0)
    expect(parse({ window: '5' })).toHaveLength(1)
    expect(parse({ window: '1' })).toHaveLength(1)
    expect(parse({ window: 'four' })).toHaveLength(1)
  })

  it('(19) an unknown query key is a 400 — every field a client may send is declared', () => {
    expect(parse({ cohortWindow: 4 })).toHaveLength(1)
    expect(parse({ subject: 'reading' })).toHaveLength(1) // the LEGACY name, deliberately not here
    expect(parse({ scope: 'diocese' })).toHaveLength(1)
    expect(parse({ testType: 'nonsense' })).toHaveLength(1)
    expect(parse({ schoolYear: '1899' })).toHaveLength(1)
    expect(parse({ scope: 'org', series: 'reading', endGrade: '8', hidePeerNames: 'false' })).toHaveLength(0)
  })

  it('the boolean query params mean what they say ("false" is false)', () => {
    const dto = plainToInstance(CohortQueryDto, { hidePeerNames: 'false', includeMatrix: 'true' })
    expect(dto.hidePeerNames).toBe(false)
    expect(dto.includeMatrix).toBe(true)
  })

  it('(20) the school route sits behind the same roles and the same licence as its siblings', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AcademicsController.prototype.cohorts)
    expect(roles).toEqual(['owner', 'accountant', 'viewer'])
    // Class-level: the academics licence answers 402 for every route here,
    // including this read.
    expect(Reflect.getMetadata(REQUIRES_MODULE, AcademicsController)).toEqual(['academics'])
    const dashboardRoles = Reflect.getMetadata(ROLES_KEY, AcademicsController.prototype.dashboard)
    expect(roles).toEqual(dashboardRoles)
    // The register is still stricter — this route must not have loosened it.
    expect(Reflect.getMetadata(ROLES_KEY, AcademicsController.prototype.results)).toEqual(['owner', 'accountant'])
  })

  it('(20) the org route checks membership AND a licensed school, like the console beside it', () => {
    const handler = orgControllerSource.slice(
      orgControllerSource.indexOf("@Get('academics/cohorts')"),
      orgControllerSource.indexOf('Preview a DIOCESAN file'),
    )
    expect(handler).toContain('await this.assertMember(user, orgId)')
    expect(handler).toContain('await this.readableSchools(user, orgId)')
    expect(handler).toContain('this.assessments.orgCohorts(orgId, q)')
  })
})

// ── The additive promise ─────────────────────────────────────────────────────

describe('cohorts — the two-leg engine and its callers are untouched', () => {
  it('the dashboard still serves data.cohort from cohortMovements/cohortSummary', () => {
    expect(serviceSource).toContain('cohort,')
    expect(serviceSource).toContain('summary: cohortSummary(cohortMoves)')
    expect(serviceSource).toContain('availableCohorts: availableCohorts(inScope)')
  })

  it('cohortMovements is called ONCE per payload, not twice with identical arguments', () => {
    const calls = serviceSource.match(/cohortMovements\(inScope/g) ?? []
    // One in dashboard(), one in orgDashboard(). The dashboard used to run the
    // same traversal twice to feed its own summary.
    expect(calls).toHaveLength(2)
  })
})
