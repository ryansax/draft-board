import { describe, it, expect } from 'vitest'
import type { Player, PlayerStatus } from '../types'
import { currentPick, isMarked } from './draft'

/*
 * Correcting a pick already on the board.
 *
 * The clock is derived — it counts marked players and adds the offset — so
 * emptying or filling a cell behind the clock would drag the whole draft
 * backwards or forwards. These pin the arithmetic that holds it still, which is
 * the part that is easy to get wrong and impossible to notice mid-draft.
 */

function player(id: string, o: Partial<Player> = {}): Player {
  return {
    id,
    position: 'RB',
    rank: 1,
    tier: 1,
    name: id,
    team: 'ATL',
    adp12: null,
    adpOverall: null,
    risk: null,
    upside: null,
    badges: [],
    status: 'available',
    draftedAtPick: null,
    ...o,
  }
}

/** The store's rule, isolated: hold `currentPick` steady across an edit. */
function offsetAfter(before: Player[], after: Player[], pickOffset: number): number {
  return pickOffset + before.filter(isMarked).length - after.filter(isMarked).length
}

const taken = (id: string, cell: number, status: PlayerStatus = 'drafted') =>
  player(id, { status, draftedAtPick: cell })

describe('swapping one player for another in a cell', () => {
  const before = [taken('brian', 2), taken('someone', 1), player('bijan')]
  const after = [
    player('brian'),
    taken('someone', 1),
    taken('bijan', 2),
  ]

  it('leaves the clock exactly where it was', () => {
    const offset = offsetAfter(before, after, 0)
    expect(offset).toBe(0)
    expect(currentPick(after, offset)).toBe(currentPick(before, 0))
  })

  it('frees the player who was wrongly logged', () => {
    const brian = after.find((p) => p.id === 'brian')!
    expect(brian.status).toBe('available')
    expect(brian.draftedAtPick).toBeNull()
  })

  it('puts the right player in that cell', () => {
    expect(after.find((p) => p.id === 'bijan')!.draftedAtPick).toBe(2)
  })
})

describe('clearing a cell', () => {
  const before = [taken('a', 1), taken('b', 2), taken('c', 3)]
  const after = [taken('a', 1), player('b'), taken('c', 3)]

  it('does not walk the draft backwards', () => {
    // Three picks made, so the clock reads 4. It must still read 4.
    expect(currentPick(before, 0)).toBe(4)
    const offset = offsetAfter(before, after, 0)
    expect(offset).toBe(1)
    expect(currentPick(after, offset)).toBe(4)
  })
})

describe('filling a cell that was skipped', () => {
  const before = [taken('a', 1), taken('c', 3)]
  const after = [taken('a', 1), taken('b', 2), taken('c', 3)]

  it('does not jump the draft forwards', () => {
    expect(currentPick(before, 0)).toBe(3)
    const offset = offsetAfter(before, after, 0)
    expect(offset).toBe(-1)
    expect(currentPick(after, offset)).toBe(3)
  })
})

describe('moving a player who was logged in the wrong cell', () => {
  // He was recorded at 5; he actually went at 2. Cell 5 empties, cell 2 fills.
  const before = [taken('a', 1), taken('bijan', 5)]
  const after = [taken('a', 1), taken('bijan', 2)]

  it('is a wash for the clock, since nobody joined or left the board', () => {
    const offset = offsetAfter(before, after, 0)
    expect(offset).toBe(0)
    expect(currentPick(after, offset)).toBe(currentPick(before, 0))
  })
})

describe('an existing offset is carried, not clobbered', () => {
  it('keeps a nudged counter nudged', () => {
    const before = [taken('a', 1), taken('b', 2)]
    const after = [taken('a', 1), player('b')]
    // The counter had been pushed forward by 7 for picks that slipped by.
    expect(currentPick(before, 7)).toBe(10)
    const offset = offsetAfter(before, after, 7)
    expect(currentPick(after, offset)).toBe(10)
  })
})
