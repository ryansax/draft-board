import { describe, expect, it } from 'vitest'
import {
  buildDraftGrid,
  isMyTurn,
  statusForTap,
  managerRosters,
  nextPickAfter,
  pressureBeforeMyPick,
  recommendPicks,
  roundForPick,
  slotForPick,
  unmetNeeds,
} from './insights'
import { DEFAULT_ROSTER, defaultManagers, type Player, type Position, type Session } from '../types'

function mk(position: Position, rank: number, o: Partial<Player> = {}): Player {
  return {
    id: `${position}-${rank}`, position, rank, tier: 1, name: `${position}${rank}`,
    team: 'BUF', adp12: null, adpOverall: rank, risk: 5, upside: 5, badges: [],
    status: 'available', draftedAtPick: null, ...o,
  }
}

function session(players: Player[], o: Partial<Session> = {}): Session {
  const leagueSize = o.leagueSize ?? 10
  const draftSlot = o.draftSlot ?? 3
  return {
    id: 's', name: 'test', createdAt: 0, updatedAt: 0, sheetTitle: '', sheetDate: null,
    leagueSize, draftSlot, managers: defaultManagers(leagueSize, draftSlot),
    rosterConfig: DEFAULT_ROSTER, players, undoStack: [], pickOffset: 0, trades: [],
    dismissedTierAlerts: [], ...o,
  }
}

describe('snake geometry', () => {
  it('maps a pick back to its round', () => {
    expect(roundForPick(1, 10)).toBe(1)
    expect(roundForPick(10, 10)).toBe(1)
    expect(roundForPick(11, 10)).toBe(2)
    expect(roundForPick(21, 10)).toBe(3)
  })

  it('maps a pick back to its slot through the snake', () => {
    // Round 1 runs 1..10, round 2 runs 10..1.
    expect([1, 2, 3, 10].map((p) => slotForPick(p, 10))).toEqual([1, 2, 3, 10])
    expect([11, 12, 20].map((p) => slotForPick(p, 10))).toEqual([10, 9, 1])
    expect([21, 30].map((p) => slotForPick(p, 10))).toEqual([1, 10])
  })

  it('round-trips against the pick formula for every slot', () => {
    for (const size of [8, 10, 12, 14]) {
      for (let pick = 1; pick <= size * 6; pick++) {
        const slot = slotForPick(pick, size)
        expect(slot).toBeGreaterThanOrEqual(1)
        expect(slot).toBeLessThanOrEqual(size)
      }
    }
  })

  it('finds my following pick', () => {
    const s = session([], { leagueSize: 10, draftSlot: 3 })
    expect(nextPickAfter(s, 3)).toBe(18)
    expect(nextPickAfter(s, 18)).toBe(23)
    expect(nextPickAfter(s, 1)).toBe(3)
  })
})

describe('whose turn it is', () => {
  it('knows my own picks in a 10-team snake from slot 3', () => {
    // Slot 3 owns picks 3, 18, 23, 38...
    expect([3, 18, 23, 38].map((p) => isMyTurn(p, 10, 3))).toEqual([true, true, true, true])
    expect([1, 2, 4, 17, 19, 22].map((p) => isMyTurn(p, 10, 3))).toEqual(
      [false, false, false, false, false, false],
    )
  })

  it('works at the turn slots', () => {
    expect(isMyTurn(10, 10, 10)).toBe(true)
    expect(isMyTurn(11, 10, 10)).toBe(true)
    expect(isMyTurn(20, 10, 1)).toBe(true)
  })

  it('marks a plain tap as mine only on my own pick', () => {
    expect(statusForTap(true)).toBe('mine')
    expect(statusForTap(false)).toBe('drafted')
  })

  it('lets a modifier force the opposite either way', () => {
    expect(statusForTap(true, true)).toBe('drafted')
    expect(statusForTap(false, true)).toBe('mine')
  })
})

describe('draft grid', () => {
  it('lays out rounds by slot and places picks in the right cells', () => {
    const s = session([
      mk('RB', 1, { status: 'drafted', draftedAtPick: 1 }),
      mk('WR', 1, { status: 'mine', draftedAtPick: 3 }),
      mk('QB', 1, { status: 'drafted', draftedAtPick: 11 }),
    ])
    const grid = buildDraftGrid(s)
    expect(grid[0]).toHaveLength(10)
    expect(grid[0][0].pick).toBe(1)
    expect(grid[0][0].player!.name).toBe('RB1')
    expect(grid[0][2].player!.name).toBe('WR1')
    expect(grid[0][2].isMine).toBe(true)
    // Round 2 reverses: slot 10 picks 11th overall.
    expect(grid[1][9].pick).toBe(11)
    expect(grid[1][9].player!.name).toBe('QB1')
    expect(grid[1][0].pick).toBe(20)
  })

  it('has a row per roster spot', () => {
    expect(buildDraftGrid(session([]))).toHaveLength(15)
  })
})

describe('manager rosters', () => {
  it('attributes each pick to the slot that made it', () => {
    const s = session([
      mk('RB', 1, { status: 'drafted', draftedAtPick: 1 }),
      mk('RB', 2, { status: 'drafted', draftedAtPick: 11 }),
      mk('WR', 1, { status: 'mine', draftedAtPick: 3 }),
    ])
    const rosters = managerRosters(s)
    expect(rosters.get(1)!.map((p) => p.name)).toEqual(['RB1'])
    expect(rosters.get(10)!.map((p) => p.name)).toEqual(['RB2'])
    expect(rosters.get(3)!.map((p) => p.name)).toEqual(['WR1'])
    expect(rosters.get(5)).toEqual([])
  })
})

describe('unmet needs', () => {
  it('lists every empty starting slot for an empty roster', () => {
    const needs = unmetNeeds([], DEFAULT_ROSTER)
    expect(needs.filter((n) => n === 'RB')).toHaveLength(3) // RB2 + flex eligibility
    expect(needs).toContain('QB')
    expect(needs).toContain('DST')
  })

  it('consumes the dedicated slot before the flex', () => {
    const roster = [mk('QB', 1), mk('QB', 2)]
    const needs = unmetNeeds(roster, DEFAULT_ROSTER)
    expect(needs).not.toContain('QB')
  })

  it('drops flex eligibility once the flex is filled', () => {
    const roster = [mk('RB', 1), mk('RB', 2), mk('RB', 3), mk('WR', 1), mk('WR', 2)]
    const needs = unmetNeeds(roster, DEFAULT_ROSTER)
    expect(needs).not.toContain('RB')
    expect(needs).not.toContain('WR')
  })
})

describe('pressure before my pick', () => {
  it('counts how many managers ahead of me still need each position', () => {
    const s = session([], { leagueSize: 10, draftSlot: 3 })
    // Nobody has drafted, so every manager between picks 4 and 17 needs everything.
    const pressure = pressureBeforeMyPick(s, 4, 18)
    expect(pressure.length).toBeGreaterThan(0)
    const qb = pressure.find((p) => p.position === 'QB')!
    expect(qb.managersNeeding).toBe(14) // picks 4..17 inclusive, none of them mine
  })

  it('skips my own slot', () => {
    const s = session([], { leagueSize: 10, draftSlot: 3 })
    const pressure = pressureBeforeMyPick(s, 3, 18)
    expect(pressure.find((p) => p.position === 'QB')!.managersNeeding).toBe(14)
  })

  it('is empty when I am on the clock', () => {
    expect(pressureBeforeMyPick(session([]), 18, 18)).toEqual([])
    expect(pressureBeforeMyPick(session([]), 18, null)).toEqual([])
  })
})

describe('recommendations', () => {
  it('prefers the player who fills a starting hole, all else equal', () => {
    const s = session([
      mk('RB', 1, { adpOverall: 20 }),
      mk('QB', 1, { adpOverall: 20 }),
      mk('QB', 2, { adpOverall: 20, status: 'mine', draftedAtPick: 3 }),
    ])
    const [top] = recommendPicks(s, 18, 18, 3)
    expect(top.player.position).toBe('RB') // QB slot already filled
    expect(top.reasons.join(' ')).toMatch(/Fills an open RB/)
  })

  it('does not recommend a kicker or defense early, however good the value looks', () => {
    const s = session([
      mk('K', 1, { adpOverall: 5 }),
      mk('DST', 1, { adpOverall: 5 }),
      mk('RB', 1, { adpOverall: 60 }),
    ])
    const recs = recommendPicks(s, 3, 3, 5)
    expect(recs.map((r) => r.player.position)).toEqual(['RB'])
  })

  it('allows a kicker in the endgame', () => {
    const s = session([mk('K', 1, { adpOverall: null })])
    const lastRoundPick = 15 * 10 - 5
    const recs = recommendPicks(s, lastRoundPick, lastRoundPick, 1)
    expect(recs[0].reasons).toContain('Endgame K')
  })

  it('deprioritises a player who will still be there next time', () => {
    const s = session([
      mk('WR', 1, { adpOverall: 18 }),
      mk('WR', 2, { adpOverall: 60 }),
    ])
    const recs = recommendPicks(s, 18, 18, 2)
    expect(recs[0].player.name).toBe('WR1')
    const waiting = recs.find((r) => r.player.name === 'WR2')!
    // Planning pick 18 for slot 3, so my following turn is 23.
    expect(waiting.reasons.join(' ')).toMatch(/Should still be there at #23 — you can wait/)
  })

  it('names the turn after the one being planned, not the one being planned', () => {
    const s = session([mk('WR', 1, { adpOverall: 10 })], { leagueSize: 10, draftSlot: 3 })
    // Planning pick 18; my following turn is 23, and he will not survive it.
    const [top] = recommendPicks(s, 18, 18, 1)
    expect(top.reasons.join(' ')).toMatch(/Won't last to #23, your next turn/)
  })

  it('flags a falling player and the last of a tier', () => {
    const s = session([
      mk('RB', 1, { adpOverall: 2, tier: 1 }),
      mk('RB', 2, { adpOverall: 2, tier: 1, status: 'drafted', draftedAtPick: 1 }),
    ])
    const [top] = recommendPicks(s, 18, 18, 1)
    expect(top.reasons.join(' ')).toMatch(/Falling/)
    expect(top.reasons.join(' ')).toMatch(/Last 1 in RB tier 1/)
  })

  it('never recommends a player who is already gone', () => {
    const s = session([
      mk('RB', 1, { adpOverall: 1, status: 'drafted', draftedAtPick: 1 }),
      mk('RB', 2, { adpOverall: 40 }),
    ])
    const recs = recommendPicks(s, 5, 5, 5)
    expect(recs.map((r) => r.player.name)).toEqual(['RB2'])
  })

  it('gives your guy a nudge', () => {
    const plain = mk('WR', 1, { adpOverall: 20 })
    const favourite = mk('WR', 2, { adpOverall: 20, badges: ['myGuy'] })
    const recs = recommendPicks(session([plain, favourite]), 18, 18, 2)
    expect(recs[0].player.name).toBe('WR2')
    expect(recs[0].reasons).toContain('Your guy on the sheet')
  })
})
