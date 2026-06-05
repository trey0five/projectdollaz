// ─────────────────────────────────────────────────────────────
// Statement of Activities. Ported VERBATIM from legacy calcSOA.
//
// Revenue accounts carry credit (negative) balances → negated to
// display positive. The negation is kept literal here so numeric
// outputs are byte-for-byte identical; the SCoA `sign` field is
// metadata that REFLECTS this (used for lineage), not a new code path.
//
// tuition uses an explicit acct list [401..409] (sumByAccts), NOT the
// category sum, to match legacy exactly.
// ─────────────────────────────────────────────────────────────
import type { Dataset } from '../types/rows.js'
import type { SOAResult } from '../types/results.js'
import type { StatementLineage, LineLineage } from '../types/lineage.js'
import type { SCoaCategory } from '../scoa/categories.js'
import {
  DEFAULT_CHART,
  type StandardChart,
  sumByAccts,
  sumByCategory,
  rowsByAccts,
  rowsByCategory,
} from '../scoa/chart.js'

const TUITION_ACCTS = [401, 402, 403, 404, 405, 409]

export function calcSOA(
  data: Dataset,
  chart: StandardChart = DEFAULT_CHART
): SOAResult {
  const sumA = (accts: number[]) => sumByAccts(data, accts)
  const sumC = (cat: SCoaCategory) => sumByCategory(data, cat, chart)

  // Revenue accounts carry credit (negative) balances → negate to display.
  const tuition = -sumA(TUITION_ACCTS)
  const dev = -sumC('development')
  const studAct = -sumC('studActRev')
  const textbook = -sumC('textbook')
  const other = -sumC('other')
  const support = -sumC('support')
  const intlRev = -sumC('intlRev')
  const investments = -sumC('investments')
  const interest = -sumC('interest')
  const totalRev =
    tuition + dev + studAct + textbook + other + support + intlRev + investments + interest

  const instructional = sumC('instrSal') + sumC('instrSup')
  const facilities = sumC('facilSal') + sumC('facilCost')
  const fixedOther = sumC('fixedOther')
  const intlExp = sumC('intlExp')
  const bus = sumC('bus')
  const food = sumC('food')
  const studActExp = sumC('studActExp') || 0
  const athletics = sumC('athletics')
  const admin = sumC('adminSal') + sumC('adminCost')
  const restricted = sumC('restricted')
  const totalExp =
    instructional + facilities + fixedOther + intlExp + bus + food +
    studActExp + athletics + admin + restricted

  return {
    tuition, dev, studAct, textbook, other, support, intlRev, investments, interest, totalRev,
    instructional, facilities, fixedOther, intlExp, bus, food, studActExp, athletics, admin,
    restricted, totalExp,
    netChange: totalRev - totalExp,
  }
}

/** Build SOA lineage in parallel (numbers unchanged). */
export function buildSOALineage(
  data: Dataset,
  result: SOAResult,
  chart: StandardChart = DEFAULT_CHART
): StatementLineage {
  const lineage: StatementLineage = {}

  const revLine = (line: string, cat: SCoaCategory, value: number) => {
    lineage[line] = {
      line,
      scoaCategory: cat,
      statement: 'SOA',
      sign: -1,
      value,
      sources: rowsByCategory(data, cat, chart),
    }
  }
  const expLine = (line: string, cats: SCoaCategory[], value: number) => {
    const sources = cats.flatMap((c) => rowsByCategory(data, c, chart))
    lineage[line] = {
      line,
      scoaCategory: cats.length === 1 ? cats[0]! : null,
      statement: 'SOA',
      sign: 1,
      value,
      sources,
    }
  }

  // tuition uses explicit acct list, not category sum.
  lineage.tuition = {
    line: 'tuition',
    scoaCategory: 'tuition',
    statement: 'SOA',
    sign: -1,
    value: result.tuition,
    sources: rowsByAccts(data, TUITION_ACCTS),
  }
  revLine('dev', 'development', result.dev)
  revLine('studAct', 'studActRev', result.studAct)
  revLine('textbook', 'textbook', result.textbook)
  revLine('other', 'other', result.other)
  revLine('support', 'support', result.support)
  revLine('intlRev', 'intlRev', result.intlRev)
  revLine('investments', 'investments', result.investments)
  revLine('interest', 'interest', result.interest)

  expLine('instructional', ['instrSal', 'instrSup'], result.instructional)
  expLine('facilities', ['facilSal', 'facilCost'], result.facilities)
  expLine('fixedOther', ['fixedOther'], result.fixedOther)
  expLine('intlExp', ['intlExp'], result.intlExp)
  expLine('bus', ['bus'], result.bus)
  expLine('food', ['food'], result.food)
  expLine('studActExp', ['studActExp'], result.studActExp)
  expLine('athletics', ['athletics'], result.athletics)
  expLine('admin', ['adminSal', 'adminCost'], result.admin)
  expLine('restricted', ['restricted'], result.restricted)

  const totalLine = (line: string, value: number, sign: 1 | -1): LineLineage => ({
    line,
    scoaCategory: null,
    statement: 'SOA',
    sign,
    value,
    sources: [],
  })
  lineage.totalRev = totalLine('totalRev', result.totalRev, -1)
  lineage.totalExp = totalLine('totalExp', result.totalExp, 1)
  lineage.netChange = totalLine('netChange', result.netChange, 1)

  return lineage
}
