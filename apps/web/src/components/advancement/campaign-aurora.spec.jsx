import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { campaignPace } from './CampaignProgress.jsx'

// ─────────────────────────────────────────────────────────────────────────────
// A campaign's page on the Aurora band (2026-10-15): the band says what the
// campaign raised against its OWN goal and its pace against its OWN window; a
// campaign with no goal or no window gets no pace judgement. Amounts only —
// no donor names anywhere on the page.
// ─────────────────────────────────────────────────────────────────────────────
afterEach(cleanup)

const school = { id: 's1', name: 'Test School', role: 'owner' }
vi.mock('../../context/SchoolContext.jsx', () => ({
  useSchools: () => ({ activeSchool: school }),
  useOptionalSchools: () => ({ activeSchool: school }),
}))
vi.mock('../BillingBanner.jsx', () => ({ default: () => null }))

let items = []
vi.mock('../../hooks/useAdvancement.js', () => ({
  useAdvancement: () => ({
    items,
    loading: false,
    notLicensed: false,
    notEntitled: false,
    updateItem: async () => {},
    listGifts: async () => [],
    createGift: async () => {},
    updateGift: async () => {},
    removeGift: async () => {},
  }),
}))

const { default: CampaignDetailPage } = await import('../../pages/CampaignDetailPage.jsx')

const page = () =>
  render(
    <MemoryRouter initialEntries={['/advancement/campaigns/c1']}>
      <Routes>
        <Route path="/advancement/campaigns/:campaignId" element={<CampaignDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('campaignPace', () => {
  it('judges only against the campaign’s own goal and window', () => {
    expect(campaignPace({ raised: 10, goal: null })).toBeNull()
    expect(campaignPace({ raised: 10, goal: 100 })).toBeNull() // no window → no guess
    expect(campaignPace({ raised: 120, goal: 100 })).toEqual({ label: 'Goal exceeded', tone: 'good' })
  })

  it('pace is judged only while a campaign is active', () => {
    const window = { startDate: '2020-01-01', closeDate: '2021-01-01' } // long over
    // A planned campaign has not started: no pace, no pill.
    expect(campaignPace({ raised: 0, goal: 100, ...window, status: 'planned' })).toBeNull()
    // A closed campaign has an outcome, not a pace — never "Behind pace" forever.
    const closed = campaignPace({ raised: 80, goal: 100, ...window, status: 'closed' })
    expect(closed.label).toBe('Closed at 80% of goal')
    expect(closed.tone).toBe('neutral')
    expect(campaignPace({ raised: 100, goal: 100, ...window, status: 'closed' }).tone).toBe('good')
    // An active one past its window and short of goal IS behind.
    expect(campaignPace({ raised: 80, goal: 100, ...window, status: 'active' })).toEqual({
      label: 'Behind pace',
      tone: 'risk',
    })
  })
})

describe('Campaign detail — the Aurora band', () => {
  it('says raised of goal, shows four glass cards and an empty ledger with its one button', async () => {
    items = [
      {
        id: 'c1',
        name: 'Annual Fund',
        status: 'active',
        campaignType: 'annual_fund',
        raisedAmount: 5000,
        pledgedOutstanding: 1000,
        goalAmount: 10000,
        giftCount: 0,
      },
    ]
    const { container, findByText } = page()
    const hero = container.querySelector('.au-hero')
    expect(hero.querySelector('h1, h2').textContent).toBe('Annual Fund')
    expect(hero.textContent).toContain('$5,000 raised of a $10,000 goal.')
    expect(container.querySelectorAll('.au-kpis .au-kpi')).toHaveLength(4)
    expect(await findByText('No gifts or pledges yet.')).toBeTruthy()
    await waitFor(() => expect(container.textContent).toContain('Add a gift or pledge'))
  })

  it('an unknown campaign gets the band and a way back', () => {
    items = []
    const { container } = page()
    expect(container.querySelector('.au-hero').textContent).toContain('Campaign not found')
    expect(container.querySelector('a[href="/advancement"]')).toBeTruthy()
  })
})
