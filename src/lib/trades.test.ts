import { describe, it, expect } from 'vitest'
import type { RosterConfig, Session } from '../types'
import {
  cellForMoment,
  cellsForSlot,
  isTraded,
  momentForCell,
  momentsForSlot,
  slotAtMoment,
  swapNextPicks,
  nextTradeGroup,
  tradesForCell,
  cellsInGroup,
  type PickTrade,
} from './trades'

const ROSTER: RosterConfig = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BN: 6 }

function session(trades: PickTrade[] = []): Session {
  return {
    id: 's',
    name: 'draft',
    createdAt: 0,
    updatedAt: 0,
    sheetTitle: '',
    sheetDate: null,
    leagueSize: 10,
    draftSlot: 1,
    managers: Array.from({ length: 10 }, (_, i) => `Team ${i + 1}`),
    rosterConfig: ROSTER,
    players: [],
    undoStack: [],
    pickOffset: 0,
    trades,
    dismissedTierAlerts: [],
  }
}

/*
 * The worked example from the draft table, in a ten-team league:
 *
 * Slot 1 owns 1, 20, 21, 40, 41, 60, 61, 80 …
 * Slot 6 owns 6, 15, 26, 35, 46, 55, 66, 75 …
 *
 * On the clock at moment 61, slots 1 and 6 swap their next two picks. Slot 6
 * then chooses at moment 61 and his card lands in cell 66, his own column; slot
 * 1 chooses at moment 66 and lands in cell 61. Same again a round later with 75
 * and 80.
 */
const TRADED = session([
  { a: 61, b: 66 },
  { a: 80, b: 75 },
])

describe('the worked example from the table', () => {
  it('builds exactly the two swaps that were agreed', () => {
    expect(swapNextPicks(session(), 1, 6, 2, 61)).toEqual([
      { a: 61, b: 66 },
      { a: 80, b: 75 },
    ])
  })

  it('sends every moment in the two rounds to the right cell', () => {
    const expected: Record<number, number> = {
      61: 66, 62: 62, 63: 63, 64: 64, 65: 65, 66: 61,
      67: 67, 68: 68, 69: 69, 70: 70, 71: 71, 72: 72, 73: 73, 74: 74,
      75: 80, 76: 76, 77: 77, 78: 78, 79: 79, 80: 75,
    }
    for (const [moment, cell] of Object.entries(expected)) {
      expect(cellForMoment(Number(moment), TRADED.trades)).toBe(cell)
    }
  })

  it('has the right manager choosing at each traded moment', () => {
    expect(slotAtMoment(61, TRADED)).toBe(6)
    expect(slotAtMoment(66, TRADED)).toBe(1)
    expect(slotAtMoment(75, TRADED)).toBe(1)
    expect(slotAtMoment(80, TRADED)).toBe(6)
    // Everybody in between is where they always were.
    expect(slotAtMoment(62, TRADED)).toBe(2)
    expect(slotAtMoment(71, TRADED)).toBe(10)
  })

  it('leaves each manager choosing once per round, just later or sooner', () => {
    expect(momentsForSlot(TRADED, 1).slice(5, 8)).toEqual([60, 66, 75])
    expect(momentsForSlot(TRADED, 6).slice(5, 8)).toEqual([55, 61, 80])
  })

  it('keeps every card in its own column', () => {
    // Cells are untouched by a trade: a column is still that manager's roster.
    expect(cellsForSlot(TRADED, 1).slice(5, 8)).toEqual([60, 61, 80])
    expect(cellsForSlot(TRADED, 6).slice(5, 8)).toEqual([55, 66, 75])
  })
})

describe('the mapping itself', () => {
  it('is the identity when nobody has traded', () => {
    for (const moment of [1, 7, 61, 150]) {
      expect(cellForMoment(moment, [])).toBe(moment)
      expect(momentForCell(moment, [])).toBe(moment)
      expect(isTraded(moment, [])).toBe(false)
    }
  })

  it('round-trips: every moment maps back to itself', () => {
    for (let moment = 1; moment <= 150; moment++) {
      expect(momentForCell(cellForMoment(moment, TRADED.trades), TRADED.trades)).toBe(moment)
    }
  })

  it('is a permutation: no two moments land on the same cell', () => {
    const cells = new Set<number>()
    for (let moment = 1; moment <= 150; moment++) cells.add(cellForMoment(moment, TRADED.trades))
    expect(cells.size).toBe(150)
  })

  it('marks only the cells that actually moved', () => {
    expect(isTraded(61, TRADED.trades)).toBe(true)
    expect(isTraded(66, TRADED.trades)).toBe(true)
    expect(isTraded(62, TRADED.trades)).toBe(false)
  })
})

describe('trades stacking on each other', () => {
  it('survives a second trade involving an already-traded pick', () => {
    // Slot 1 gets 66 from slot 6, then trades that turn on to slot 3.
    const first = swapNextPicks(session(), 1, 6, 1, 61)
    const after = session(first)
    const second = swapNextPicks(after, 1, 3, 1, 62)
    const both = session([...first, ...second])

    // Still a clean permutation with nobody picking twice at one moment.
    const cells = new Set<number>()
    for (let m = 1; m <= 150; m++) cells.add(cellForMoment(m, both.trades))
    expect(cells.size).toBe(150)
    // And each moment still round-trips.
    for (let m = 55; m <= 90; m++) {
      expect(momentForCell(cellForMoment(m, both.trades), both.trades)).toBe(m)
    }
  })
})

describe('what a trade refuses to do', () => {
  it('will not move a pick that has already happened', () => {
    // Asking at moment 61 cannot touch slot 1's cell 60, which is behind us.
    const swaps = swapNextPicks(session(), 1, 6, 2, 61)
    expect(swaps.flatMap((t) => [t.a, t.b])).not.toContain(60)
    expect(swaps.flatMap((t) => [t.a, t.b])).not.toContain(55)
  })

  it('refuses to trade a manager with himself', () => {
    expect(swapNextPicks(session(), 4, 4, 2, 61)).toEqual([])
  })

  it('stops at however many picks are actually left', () => {
    // Deep in the last round there are not two picks each still to come.
    const late = swapNextPicks(session(), 1, 6, 2, 146)
    expect(late.length).toBeLessThanOrEqual(1)
  })

  it('handles a count of zero or less as no trade at all', () => {
    expect(swapNextPicks(session(), 1, 6, 0, 61)).toEqual([])
  })
})

describe('drafting through a trade, pick by pick', () => {
  /*
   * Replays the store's own rule — a selection fills the cell that this moment
   * maps to — for the whole two rounds, to be sure the cards land where the table
   * expects and that each column still holds one player per round.
   */
  function replay(trades: PickTrade[], from: number, to: number) {
    const filled = new Map<number, number>() // cell -> moment it was filled at
    for (let moment = from; moment <= to; moment++) {
      filled.set(cellForMoment(moment, trades), moment)
    }
    return filled
  }

  it('drops each card in the cell the table expects', () => {
    const filled = replay(TRADED.trades, 61, 80)
    expect(filled.get(66)).toBe(61)
    expect(filled.get(61)).toBe(66)
    expect(filled.get(80)).toBe(75)
    expect(filled.get(75)).toBe(80)
    expect(filled.get(62)).toBe(62)
  })

  it('fills every cell in the two rounds exactly once', () => {
    const filled = replay(TRADED.trades, 61, 80)
    expect(filled.size).toBe(20)
    for (let cell = 61; cell <= 80; cell++) expect(filled.has(cell)).toBe(true)
  })

  it('gives slot 1 and slot 6 one pick each per round, as always', () => {
    const filled = replay(TRADED.trades, 61, 80)
    const cellsOf = (slot: number) =>
      [...filled.keys()].filter((cell) => slotForPickLocal(cell) === slot).sort((x, y) => x - y)
    expect(cellsOf(1)).toEqual([61, 80])
    expect(cellsOf(6)).toEqual([66, 75])
  })

  it('leaves an untraded draft filling cells in plain order', () => {
    const filled = replay([], 61, 80)
    for (let cell = 61; cell <= 80; cell++) expect(filled.get(cell)).toBe(cell)
  })
})

/** Snake slot for a 10-team league, kept local so the test does its own maths. */
function slotForPickLocal(pick: number): number {
  const round = Math.ceil(pick / 10)
  const index = pick - (round - 1) * 10
  return round % 2 === 1 ? index : 10 - index + 1
}

describe('numbering the agreements', () => {
  it('gives one handshake one number, however many picks it moved', () => {
    const group = nextTradeGroup([])
    const swaps = swapNextPicks(session(), 1, 6, 2, 61).map((s) => ({ ...s, group }))
    expect(swaps.map((s) => s.group)).toEqual([1, 1])
  })

  it('numbers the next agreement after the last one', () => {
    expect(nextTradeGroup([{ a: 1, b: 2, group: 1 }, { a: 3, b: 4, group: 1 }])).toBe(2)
    expect(nextTradeGroup([{ a: 1, b: 2, group: 3 }])).toBe(4)
  })

  it('numbers swaps recorded before trades had numbers', () => {
    // Old sessions carry no group; position stands in so nothing renders blank.
    expect(tradesForCell(1, [{ a: 1, b: 2 }])).toEqual([{ group: 1, partner: 2 }])
  })

  it('tells a cell what it went for, from either side of the swap', () => {
    const trades: PickTrade[] = [
      { a: 60, b: 57, group: 1 },
      { a: 61, b: 64, group: 1 },
    ]
    expect(tradesForCell(57, trades)).toEqual([{ group: 1, partner: 60 }])
    expect(tradesForCell(60, trades)).toEqual([{ group: 1, partner: 57 }])
    expect(tradesForCell(64, trades)).toEqual([{ group: 1, partner: 61 }])
    expect(tradesForCell(61, trades)).toEqual([{ group: 1, partner: 64 }])
    expect(tradesForCell(62, trades)).toEqual([])
  })

  it('marks a pick traded twice with both of its numbers', () => {
    const trades: PickTrade[] = [
      { a: 61, b: 66, group: 1 },
      { a: 66, b: 70, group: 2 },
    ]
    expect(tradesForCell(66, trades)).toEqual([
      { group: 1, partner: 61 },
      { group: 2, partner: 70 },
    ])
  })

  it('lists every cell in one agreement, in pick order', () => {
    const trades: PickTrade[] = [
      { a: 60, b: 57, group: 1 },
      { a: 61, b: 64, group: 1 },
      { a: 80, b: 75, group: 2 },
    ]
    expect(cellsInGroup(1, trades)).toEqual([57, 60, 61, 64])
    expect(cellsInGroup(2, trades)).toEqual([75, 80])
  })
})
