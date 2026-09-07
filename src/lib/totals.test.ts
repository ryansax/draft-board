import { describe, it, expect } from 'vitest'
import type { Player, Position, RosterConfig, Session } from '../types'
import { positionLeaders, teamTotals } from './totals'

const ROSTER: RosterConfig = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BN: 6 }

let n = 0
function taken(position: Position, cell: number): Player {
  n += 1
  return {
    id: `p${n}`, position, rank: 1, tier: null, name: `${position}${n}`, team: 'ATL',
    adp12: null, adpOverall: null, risk: null, upside: null, badges: [],
    status: 'drafted', draftedAtPick: cell,
  }
}

function session(players: Player[], o: Partial<Session> = {}): Session {
  return {
    id: 's', name: 'draft', createdAt: 0, updatedAt: 0, sheetTitle: '', sheetDate: null,
    leagueSize: 10, draftSlot: 1,
    managers: Array.from({ length: 10 }, (_, i) => `Team ${i + 1}`),
    rosterConfig: ROSTER, players, undoStack: [], pickOffset: 0, trades: [],
    dismissedTierAlerts: [], ...o,
  }
}

describe('counting what each team holds', () => {
  // Slot 1 owns cells 1, 20, 21 in a 10-team snake; slot 2 owns 2 and 19.
  const s = session([
    taken('RB', 1), taken('RB', 20), taken('WR', 21),
    taken('QB', 2), taken('TE', 19),
  ])
  const rows = teamTotals(s)

  it('gives a row per team, in draft order', () => {
    expect(rows).toHaveLength(10)
    expect(rows.map((r) => r.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(rows[0].name).toBe('Team 1')
  })

  it('counts each position for the right team', () => {
    expect(rows[0].counts).toMatchObject({ RB: 2, WR: 1, QB: 0, TE: 0, DST: 0, K: 0 })
    expect(rows[1].counts).toMatchObject({ QB: 1, TE: 1, RB: 0, WR: 0 })
  })

  it('totals what a team actually holds', () => {
    expect(rows[0].total).toBe(3)
    expect(rows[1].total).toBe(2)
    expect(rows[4].total).toBe(0)
  })

  it('shows a zero rather than a gap for a team with nothing', () => {
    for (const position of Object.values(rows[9].counts)) expect(position).toBe(0)
  })

  it('follows a traded pick to the column it landed in', () => {
    // Cell 20 belongs to slot 1 however late it was filled, so the count follows.
    const traded = session(s.players, { trades: [{ a: 20, b: 19, group: 1 }] })
    expect(teamTotals(traded)[0].counts.RB).toBe(2)
    expect(teamTotals(traded)[1].counts.TE).toBe(1)
  })
})

describe('who leads at each position', () => {
  it('picks the highest count, not the first', () => {
    const s = session([
      taken('RB', 1), taken('RB', 20),
      taken('RB', 2),
    ])
    expect(positionLeaders(teamTotals(s)).RB).toBe(2)
  })

  it('is zero at a position nobody has taken, so nothing is marked', () => {
    const s = session([taken('RB', 1)])
    expect(positionLeaders(teamTotals(s)).K).toBe(0)
  })

  it('copes with an empty board', () => {
    const leaders = positionLeaders(teamTotals(session([])))
    expect(Object.values(leaders).every((v) => v === 0)).toBe(true)
  })
})
