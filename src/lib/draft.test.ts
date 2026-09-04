import { describe, expect, it } from 'vitest'
import {
  bestAtPosition,
  sortPlayers,
  splitName,
  wrapIndex,
  bestAvailable,
  currentPick,
  fillRoster,
  openNeeds,
  rosterSlotList,
  searchPlayers,
  tierKey,
  tierStates,
  totalPicks,
} from './draft'
import { DEFAULT_ROSTER, type Player, type Position, type PlayerStatus } from '../types'

function mk(
  position: Position,
  rank: number,
  opts: Partial<Player> = {},
): Player {
  return {
    id: `${position}-${rank}`,
    position,
    rank,
    tier: 1,
    name: `${position}${rank}`,
    team: 'BUF',
    adp12: null,
    adpOverall: rank,
    risk: 5,
    upside: 5,
    badges: [],
    status: 'available' as PlayerStatus,
    draftedAtPick: null,
    ...opts,
  }
}

describe('currentPick', () => {
  it('counts every marked player plus one', () => {
    const players = [
      mk('RB', 1, { status: 'drafted' }),
      mk('RB', 2, { status: 'mine' }),
      mk('RB', 3),
    ]
    expect(currentPick(players, 0)).toBe(3)
  })

  it('applies the manual offset and never drops below 1', () => {
    const players = [mk('RB', 1, { status: 'drafted' })]
    expect(currentPick(players, 2)).toBe(4)
    expect(currentPick(players, -10)).toBe(1)
  })
})

describe('roster', () => {
  it('builds slots from the config', () => {
    expect(rosterSlotList(DEFAULT_ROSTER)).toEqual([
      'QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'DST', 'K',
      'BN', 'BN', 'BN', 'BN', 'BN', 'BN',
    ])
    expect(totalPicks(10, DEFAULT_ROSTER)).toBe(150)
  })

  it('seats dedicated positions, then flex, then bench', () => {
    const mine = [
      mk('RB', 1, { status: 'mine', draftedAtPick: 3 }),
      mk('RB', 2, { status: 'mine', draftedAtPick: 18 }),
      mk('RB', 3, { status: 'mine', draftedAtPick: 23 }),
      mk('RB', 4, { status: 'mine', draftedAtPick: 38 }),
    ]
    const slots = fillRoster(mine, DEFAULT_ROSTER)
    const filled = slots.filter((s) => s.player).map((s) => [s.label, s.player!.name])
    expect(filled).toEqual([
      ['RB', 'RB1'],
      ['RB', 'RB2'],
      ['FLEX', 'RB3'],
      ['BN', 'RB4'],
    ])
  })

  it('reports open starting needs and ignores the bench', () => {
    const slots = fillRoster([mk('QB', 1, { status: 'mine', draftedAtPick: 3 })], DEFAULT_ROSTER)
    expect(openNeeds(slots)).toEqual(['RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'DST', 'K'])
  })

  it('does not seat a QB in the flex', () => {
    const mine = [
      mk('QB', 1, { status: 'mine', draftedAtPick: 1 }),
      mk('QB', 2, { status: 'mine', draftedAtPick: 2 }),
    ]
    const slots = fillRoster(mine, DEFAULT_ROSTER)
    expect(slots.find((s) => s.label === 'FLEX')!.player).toBeNull()
    expect(slots.filter((s) => s.label === 'BN' && s.player).length).toBe(1)
  })
})

describe('tier scarcity', () => {
  const players = [
    mk('RB', 1, { tier: 5 }),
    mk('RB', 2, { tier: 5, status: 'drafted' }),
    mk('RB', 3, { tier: 5 }),
    mk('RB', 4, { tier: 6, status: 'drafted' }),
    mk('RB', 5, { tier: 6 }),
  ]

  it('counts remaining against the tier total', () => {
    const states = tierStates(players)
    const t5 = states.get(tierKey('RB', 5))!
    expect(t5.total).toBe(3)
    expect(t5.remaining).toBe(2)
    expect(t5.scarce).toBe(true)
  })

  it('is not scarce once fully drafted', () => {
    const states = tierStates([mk('RB', 1, { tier: 9, status: 'drafted' })])
    expect(states.get(tierKey('RB', 9))!.scarce).toBe(false)
  })
})

describe('best available', () => {
  const players = [
    mk('WR', 1, { adpOverall: 20 }),
    mk('RB', 1, { adpOverall: 5, status: 'drafted' }),
    mk('RB', 2, { adpOverall: 12 }),
    mk('TE', 1, { adpOverall: null }),
    mk('QB', 1, { adpOverall: 40 }),
  ]

  it('orders remaining players by overall ADP with null last', () => {
    expect(bestAvailable(players, 5).map((p) => p.name)).toEqual(['RB2', 'WR1', 'QB1', 'TE1'])
  })

  it('finds the best remaining player at a position by rank', () => {
    expect(bestAtPosition(players, 'RB')!.name).toBe('RB2')
    expect(bestAtPosition(players, 'DST')).toBeNull()
  })
})

describe('sortPlayers', () => {
  const players = [
    mk('WR', 1, { name: 'Sheet1', adpOverall: 30, upside: 7.0 }),
    mk('WR', 2, { name: 'Sheet2', adpOverall: 5, upside: 9.5 }),
    mk('WR', 3, { name: 'Sheet3', adpOverall: null, upside: 9.5 }),
    mk('WR', 4, { name: 'Sheet4', adpOverall: 12, upside: null }),
  ]

  it('keeps the printed ranking by default', () => {
    expect(sortPlayers(players, 'rank').map((p) => p.name)).toEqual(['Sheet1', 'Sheet2', 'Sheet3', 'Sheet4'])
  })

  it('sorts by ADP with no ADP last', () => {
    expect(sortPlayers(players, 'adp').map((p) => p.name)).toEqual(['Sheet2', 'Sheet4', 'Sheet1', 'Sheet3'])
  })

  it('sorts by upside, highest first, with no upside last', () => {
    // Sheet2 and Sheet3 tie on 9.5, so the sheet's own ranking breaks it.
    expect(sortPlayers(players, 'upside').map((p) => p.name)).toEqual(['Sheet2', 'Sheet3', 'Sheet1', 'Sheet4'])
  })

  it('sinks defenses and kickers, which carry no upside', () => {
    const rail = [
      mk('K', 1, { name: 'Kicker', adpOverall: null, upside: null }),
      mk('WR', 9, { name: 'Receiver', adpOverall: null, upside: 4.2 }),
    ]
    expect(sortPlayers(rail, 'upside').map((p) => p.name)).toEqual(['Receiver', 'Kicker'])
  })

  it('does not mutate the array it is given', () => {
    const original = [...players]
    sortPlayers(players, 'upside')
    expect(players).toEqual(original)
  })

  it('copes with an empty column', () => {
    expect(sortPlayers([], 'adp')).toEqual([])
  })
})

describe('splitName', () => {
  it('puts the given name on top and the rest below', () => {
    expect(splitName("Ja'Marr Chase")).toEqual(["Ja'Marr", 'Chase'])
    expect(splitName('Jacory Croskey-Merritt')).toEqual(['Jacory', 'Croskey-Merritt'])
  })

  it('keeps compound surnames and suffixes together', () => {
    expect(splitName('Amon-Ra St. Brown')).toEqual(['Amon-Ra', 'St. Brown'])
    expect(splitName('James Cook III')).toEqual(['James', 'Cook III'])
    expect(splitName('Harold Fannin Jr.')).toEqual(['Harold', 'Fannin Jr.'])
  })

  it('splits a defense into city and nickname', () => {
    expect(splitName('Houston Texans')).toEqual(['Houston', 'Texans'])
    expect(splitName('Tampa Bay Buccaneers')).toEqual(['Tampa', 'Bay Buccaneers'])
  })

  it('handles a single word and stray whitespace', () => {
    expect(splitName('Prime')).toEqual(['', 'Prime'])
    expect(splitName('  Josh   Allen  ')).toEqual(['Josh', 'Allen'])
    expect(splitName('')).toEqual(['', ''])
  })
})

describe('wrapIndex', () => {
  it('steps through a list', () => {
    expect(wrapIndex(0, 1, 5)).toBe(1)
    expect(wrapIndex(3, 1, 5)).toBe(4)
    expect(wrapIndex(3, -1, 5)).toBe(2)
  })

  it('wraps at both ends', () => {
    expect(wrapIndex(4, 1, 5)).toBe(0)
    expect(wrapIndex(0, -1, 5)).toBe(4)
  })

  it('copes with an empty or shrinking list', () => {
    expect(wrapIndex(3, 1, 0)).toBe(0)
    expect(wrapIndex(9, 1, 3)).toBe(0) // clamped to the last item, then wrapped
    expect(wrapIndex(9, -1, 3)).toBe(1)
    expect(wrapIndex(-4, 1, 3)).toBe(1)
  })

  it('is a no-op for a single result', () => {
    expect(wrapIndex(0, 1, 1)).toBe(0)
    expect(wrapIndex(0, -1, 1)).toBe(0)
  })
})

describe('search', () => {
  const players = [
    mk('WR', 1, { name: 'Ja\'Marr Chase' }),
    mk('RB', 1, { name: 'Bijan Robinson' }),
    mk('WR', 2, { name: 'Chase Brown' }),
    mk('TE', 1, { name: 'Brock Bowers', status: 'drafted' }),
  ]

  it('matches on a name prefix first', () => {
    expect(searchPlayers(players, 'chase')[0].name).toBe('Chase Brown')
  })

  it('matches a word inside the name', () => {
    expect(searchPlayers(players, 'robin').map((p) => p.name)).toEqual(['Bijan Robinson'])
  })

  it('ranks available players above marked ones', () => {
    const names = searchPlayers(players, 'b').map((p) => p.name)
    expect(names.indexOf('Brock Bowers')).toBeGreaterThan(0)
  })

  it('returns nothing for an empty query', () => {
    expect(searchPlayers(players, '  ')).toEqual([])
  })

  it('honours the result limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => mk('WR', i + 1, { name: `Aaron ${i}` }))
    expect(searchPlayers(many, 'aaron')).toHaveLength(8)
    expect(searchPlayers(many, 'aaron', 12)).toHaveLength(12)
  })
})
