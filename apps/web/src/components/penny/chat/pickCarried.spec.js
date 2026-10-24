import { describe, expect, it } from 'vitest'
import { pickCarried } from './usePennyChat.js'

// A file of `mb` decoded megabytes (base64 is 4/3 the size).
const file = (name, mb = 1) => ({ name, dataBase64: 'A'.repeat(Math.ceil((mb * 1024 * 1024 * 4) / 3)) })

describe('pickCarried — earlier files re-sent with a follow-up', () => {
  it('a text-only follow-up carries every earlier file', () => {
    const prior = [file('P&L.xlsx'), file('BS.xlsx')]
    expect(pickCarried(prior, []).map((f) => f.name)).toEqual(['P&L.xlsx', 'BS.xlsx'])
  })

  it('stays within 4 files per message, keeping the newest earlier files', () => {
    const prior = [file('a'), file('b'), file('c')]
    expect(pickCarried(prior, [file('x'), file('y')]).map((f) => f.name)).toEqual(['b', 'c'])
    expect(pickCarried(prior, [file('1'), file('2'), file('3'), file('4')])).toEqual([])
  })

  it('a re-attached file replaces its earlier copy', () => {
    expect(pickCarried([file('BS.xlsx'), file('P&L.xlsx')], [file('BS.xlsx')]).map((f) => f.name)).toEqual(['P&L.xlsx'])
  })

  it('never pushes the message past the 16MB server total', () => {
    const picked = pickCarried([file('old-big', 7.5), file('old-small', 1)], [file('new', 8)])
    expect(picked.map((f) => f.name)).toEqual(['old-small'])
  })
})
