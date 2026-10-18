import { describe, expect, it } from 'vitest'
import {
  benefitsLeftBesidePayroll,
  coveredSet,
  isCoveredExpense,
  isNonCashExpense,
} from './covered-categories.js'

// The line-level rules behind both derived sources (budget spread and QuickBooks
// history). Each one fires only for a commitment the school actually recorded.
describe('covered-categories line rules', () => {
  it('depreciation and amortization are non-cash by category OR label', () => {
    expect(isNonCashExpense({ label: 'Anything', category: 'deprExpense' })).toBe(true)
    expect(isNonCashExpense({ label: 'Depreciation', category: 'fixedOther' })).toBe(true)
    expect(isNonCashExpense({ label: 'Amortisation of software', category: 'adminCost' })).toBe(true)
    expect(isNonCashExpense({ label: 'Property & Liability Insurance', category: 'fixedOther' })).toBe(false)
  })

  it('payroll covers salary lines, wages and employer taxes — not fees or benefits', () => {
    const c = coveredSet(['payroll'])
    expect(isCoveredExpense({ label: 'Faculty Salaries', category: 'instrSal' }, c)).toBe(true)
    expect(isCoveredExpense({ label: 'Substitute wages', category: 'fixedOther' }, c)).toBe(true)
    expect(isCoveredExpense({ label: 'Payroll Taxes', category: 'fixedOther' }, c)).toBe(true)
    expect(isCoveredExpense({ label: 'FICA - employer', category: 'other_expense' }, c)).toBe(true)
    expect(isCoveredExpense({ label: 'Payroll processing fees', category: 'adminCost' }, c)).toBe(false)
    expect(isCoveredExpense({ label: 'Employee Benefits', category: 'fixedOther' }, c)).toBe(false)
  })

  it('no commitment ⇒ nothing is covered by label', () => {
    const c = coveredSet([])
    expect(isCoveredExpense({ label: 'Payroll Taxes', category: 'fixedOther' }, c)).toBe(false)
    expect(isCoveredExpense({ label: 'Interest Expense', category: 'fixedOther' }, c)).toBe(false)
  })

  it('debt service covers interest; insurance covers property cover, not health cover', () => {
    const c = coveredSet(['debt_service', 'insurance'])
    expect(isCoveredExpense({ label: 'Interest Expense', category: 'fixedOther' }, c)).toBe(true)
    expect(isCoveredExpense({ label: 'Property & Liability Insurance', category: 'fixedOther' }, c)).toBe(true)
    expect(isCoveredExpense({ label: 'Health Insurance - Employees', category: 'fixedOther' }, c)).toBe(false)
    expect(isCoveredExpense({ label: 'Diocesan Assessment', category: 'fixedOther' }, c)).toBe(false)
  })

  it('the benefits note fires only beside a payroll commitment', () => {
    const lines = [{ label: 'Employee Benefits', category: 'fixedOther' }]
    expect(benefitsLeftBesidePayroll(lines, coveredSet(['payroll']))).toBe(true)
    expect(benefitsLeftBesidePayroll(lines, coveredSet(['insurance']))).toBe(false)
    expect(benefitsLeftBesidePayroll([{ label: 'Utilities', category: 'facilCost' }], coveredSet(['payroll']))).toBe(false)
  })
})
