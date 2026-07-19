import { describe, expect, it } from 'vitest'
import {
  demographicKeyFromLabel,
  diversityIndex,
  gradeMixShares,
  toShares,
} from '../src/index.js'

describe('demographicKeyFromLabel', () => {
  it('maps verbose race labels to canonical keys', () => {
    expect(demographicKeyFromLabel('Black/African American')).toEqual({ dim: 'race', key: 'black' })
    expect(demographicKeyFromLabel('Native Hawaiian/Pacific Islander')).toEqual({ dim: 'race', key: 'nhpi' })
    expect(demographicKeyFromLabel('Middle Eastern/North African')).toEqual({ dim: 'race', key: 'mena' })
    expect(demographicKeyFromLabel('Two or more races')).toEqual({ dim: 'race', key: 'twoOrMore' })
    expect(demographicKeyFromLabel('White')).toEqual({ dim: 'race', key: 'white' })
    expect(demographicKeyFromLabel('Asian')).toEqual({ dim: 'race', key: 'asian' })
    expect(demographicKeyFromLabel('Hispanic or Latino')).toEqual({ dim: 'race', key: 'hispanicLatino' })
  })

  it('distinguishes ethnicity Hispanic from the race "Hispanic or Latino"', () => {
    expect(demographicKeyFromLabel('Hispanic')).toEqual({ dim: 'ethnicity', key: 'hispanic' })
    expect(demographicKeyFromLabel('Non-Hispanic')).toEqual({ dim: 'ethnicity', key: 'nonHispanic' })
  })

  it('maps gender labels', () => {
    expect(demographicKeyFromLabel('Female')).toEqual({ dim: 'gender', key: 'female' })
    expect(demographicKeyFromLabel('Male')).toEqual({ dim: 'gender', key: 'male' })
  })

  it('returns null for an unknown label', () => {
    expect(demographicKeyFromLabel('Klingon')).toBeNull()
    expect(demographicKeyFromLabel('')).toBeNull()
  })
})

describe('toShares', () => {
  it('sums to 1', () => {
    const shares = toShares({ female: 30, male: 33, unknown: 0 })
    const sum = Object.values(shares).reduce((s, v) => s + v, 0)
    expect(sum).toBeCloseTo(1, 10)
  })

  it('is all-zero for an empty / zero map', () => {
    expect(toShares({ a: 0, b: 0 })).toEqual({ a: 0, b: 0 })
    expect(toShares({})).toEqual({})
  })
})

describe('diversityIndex (Blau / Simpson)', () => {
  it('is 0 when all members are one race', () => {
    expect(diversityIndex({ white: 100 })).toBe(0)
  })

  it('approaches 1 as the mix evens out across categories', () => {
    const even2 = diversityIndex({ white: 50, black: 50 })
    const even4 = diversityIndex({ white: 25, black: 25, asian: 25, hispanicLatino: 25 })
    expect(even2).toBeCloseTo(0.5, 10)
    expect(even4).toBeCloseTo(0.75, 10)
    expect(even4).toBeGreaterThan(even2)
  })

  it('is 0 for an empty map', () => {
    expect(diversityIndex({})).toBe(0)
  })
})

describe('gradeMixShares', () => {
  it('normalizes only real grade keys and sums to 1', () => {
    const shares = gradeMixShares({ PK3: 20, PK4: 40, K: 40 })
    expect(Object.values(shares).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 10)
    expect(shares.PK4).toBeCloseTo(0.4, 10)
  })
})
