import { describe, expect, it } from 'vitest'
import { notifySendData, shouldNotify, type NotifiableFinding } from './notify-policy.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase E — ACCEPTANCE CRITERION 2, mechanised:
//
//   "Ack sets mutedUntil = +45d; the finding re-arms and re-notifies exactly once;
//    de-escalation never notifies."
//
// The whole sequence is driven with an INJECTED CLOCK. A test that proved "exactly
// once" with a sleep would prove nothing about day 46.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 24 * 3600 * 1000
const T0 = new Date('2026-08-01T04:00:00.000Z')
const at = (days: number) => new Date(T0.getTime() + days * DAY)

function finding(over: Partial<NotifiableFinding> = {}): NotifiableFinding {
  return {
    severity: 'warn',
    status: 'open',
    clearedAt: null,
    mutedUntil: null,
    lastNotifiedAt: null,
    reopenCount: 0,
    notifiedReopenCount: 0,
    notifiedSeverity: null,
    ...over,
  }
}

/** Apply what a send writes, exactly as the service does. */
function send(f: NotifiableFinding, now: Date): NotifiableFinding {
  return { ...f, ...notifySendData(f, now) }
}

describe('notify-policy — the gates', () => {
  it('never notifies a cleared finding', () => {
    expect(shouldNotify(finding({ clearedAt: at(0) }), at(1))).toBe(false)
  })

  it('never notifies a finding a human closed', () => {
    expect(shouldNotify(finding({ status: 'resolved' }), at(1))).toBe(false)
    expect(shouldNotify(finding({ status: 'dismissed' }), at(1))).toBe(false)
  })

  it('never notifies an `info` finding — it is a statement about our own visibility', () => {
    expect(shouldNotify(finding({ severity: 'info' }), at(1))).toBe(false)
  })

  it('honours a LIVE mute absolutely', () => {
    expect(shouldNotify(finding({ mutedUntil: at(10) }), at(1))).toBe(false)
  })
})

describe('notify-policy — the four clauses', () => {
  it('(a) a finding never notified notifies once, then goes quiet', () => {
    let f = finding()
    expect(shouldNotify(f, at(0))).toBe(true)
    f = send(f, at(0))
    expect(shouldNotify(f, at(0))).toBe(false)
    expect(shouldNotify(f, at(30))).toBe(false)
  })

  it('(b) a RE-ARM notifies EXACTLY ONCE', () => {
    let f = send(finding(), at(0))
    // The rule stopped firing and then fired again: reopenCount moved.
    f = { ...f, reopenCount: 1 }
    expect(shouldNotify(f, at(20))).toBe(true)
    f = send(f, at(20))
    expect(shouldNotify(f, at(21))).toBe(false)
    expect(shouldNotify(f, at(200))).toBe(false)
  })

  it('(c) an ESCALATION notifies exactly once', () => {
    let f = send(finding({ severity: 'warn' }), at(0))
    f = { ...f, severity: 'critical' }
    expect(shouldNotify(f, at(3))).toBe(true)
    f = send(f, at(3))
    expect(shouldNotify(f, at(4))).toBe(false)
  })

  it('DE-ESCALATION NEVER NOTIFIES — clause (c) is strictly greater-than', () => {
    let f = send(finding({ severity: 'critical' }), at(0))
    f = { ...f, severity: 'warn' }
    expect(shouldNotify(f, at(1))).toBe(false)
    expect(shouldNotify(f, at(90))).toBe(false)
    // …and not even after a mute lapses, because nothing re-armed and nothing
    // escalated: a problem getting smaller is not news.
    f = { ...f, mutedUntil: at(2), lastNotifiedAt: at(3) }
    expect(shouldNotify(f, at(4))).toBe(false)
  })
})

describe('notify-policy — acceptance 2, worked end to end', () => {
  it('opens, acks, is silent for 44 days, notifies ONCE on lapse, then is silent', () => {
    // Day 0 — it opens as `warn` and notifies (clause a).
    let f = finding({ severity: 'warn' })
    expect(shouldNotify(f, at(0))).toBe(true)
    f = send(f, at(0))

    // Day 0 — the user ACKS. mutedUntil = ackedUntil = +45d. `lastNotifiedAt` is
    // NOT cleared: clearing it would make clause (a) AND clause (d) both true on
    // day 46, which is the same email twice.
    const until = at(45)
    f = { ...f, status: 'acknowledged', mutedUntil: until }
    expect(f.lastNotifiedAt).not.toBeNull()

    // Days 1–44 — silent, because the mute is live.
    for (const d of [1, 7, 22, 44]) expect(shouldNotify(f, at(d))).toBe(false)

    // Day 46 — the mute has lapsed and lastNotifiedAt < mutedUntil: clause (d).
    expect(shouldNotify(f, at(46))).toBe(true)
    f = send(f, at(46))

    // Day 47 onwards — silent forever: lastNotifiedAt > mutedUntil now.
    expect(shouldNotify(f, at(47))).toBe(false)
    expect(shouldNotify(f, at(365))).toBe(false)
  })

  it('a re-arm INSIDE a live mute stays silent, then sends ONE email when it lapses', () => {
    let f = send(finding({ severity: 'warn' }), at(0))
    const until = at(45)
    f = { ...f, status: 'acknowledged', mutedUntil: until }

    // The rule stops firing, then re-arms on day 20. `status` and `mutedUntil` are
    // untouched by reconciliation, so the human's "not now" still holds.
    f = { ...f, reopenCount: 1 }
    expect(shouldNotify(f, at(20))).toBe(false)

    // Day 46: clauses (b) AND (d) are both true. The predicate is a DISJUNCTION,
    // so ONE send satisfies both — and closes both.
    expect(shouldNotify(f, at(46))).toBe(true)
    f = send(f, at(46))
    expect(shouldNotify(f, at(47))).toBe(false)
    expect(shouldNotify(f, at(120))).toBe(false)
  })

  it('a finding that stops firing goes silent, whatever its watermarks say', () => {
    let f = finding({ severity: 'critical', reopenCount: 3, notifiedReopenCount: 0 })
    expect(shouldNotify(f, at(1))).toBe(true)
    f = { ...f, clearedAt: at(2) }
    expect(shouldNotify(f, at(3))).toBe(false)
  })
})

describe('notify-policy — the send is total over the TEXT column', () => {
  it('an unrecognised stored severity ranks at the floor, and never escalates', () => {
    const f = send(finding({ severity: 'warn' }), at(0))
    // A severity nobody recognises must not read as "higher than warn".
    expect(shouldNotify({ ...f, severity: 'catastrophic' as string }, at(1))).toBe(false)
  })

  it('notifySendData writes exactly the three watermarks', () => {
    const data = notifySendData({ severity: 'critical', reopenCount: 2 }, at(5))
    expect(Object.keys(data).sort()).toEqual([
      'lastNotifiedAt',
      'notifiedReopenCount',
      'notifiedSeverity',
    ])
    expect(data.notifiedReopenCount).toBe(2)
    expect(data.notifiedSeverity).toBe('critical')
    expect(data.lastNotifiedAt).toEqual(at(5))
  })
})
