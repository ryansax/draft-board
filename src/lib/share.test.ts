import { describe, it, expect } from 'vitest'
import type { Player, Position, RosterConfig, Session } from '../types'
import { boardToSession, projectBoard, randomToken, shareConfigured } from './share'
import { currentPick } from './draft'

const ROSTER: RosterConfig = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BN: 6 }

function player(o: Partial<Player>): Player {
  return {
    id: 'x',
    position: 'RB' as Position,
    rank: 3,
    tier: 2,
    name: 'Some Player',
    team: 'ATL',
    adp12: '2.06',
    adpOverall: 18,
    risk: 4.2,
    upside: 9.1,
    badges: ['myGuy'],
    status: 'available',
    draftedAtPick: null,
    ...o,
  }
}

function session(players: Player[], o: Partial<Session> = {}): Session {
  return {
    id: 's',
    name: 'My draft',
    createdAt: 0,
    updatedAt: 0,
    sheetTitle: 'sheet 8/28',
    sheetDate: '2026-08-28',
    leagueSize: 10,
    draftSlot: 4,
    managers: Array.from({ length: 10 }, (_, i) => `Team ${i + 1}`),
    rosterConfig: ROSTER,
    players,
    undoStack: [],
    pickOffset: 0,
    trades: [],
    dismissedTierAlerts: [],
    ...o,
  }
}

const SHEET = [
  player({ id: 'a', name: 'Bijan Robinson', status: 'mine', draftedAtPick: 4, rank: 1, tier: 1, risk: 1.3, upside: 10, badges: ['myGuy'] }),
  player({ id: 'b', name: 'Jahmyr Gibbs', position: 'RB', status: 'drafted', draftedAtPick: 1, rank: 2, tier: 1, risk: 2, upside: 9.8 }),
  player({ id: 'c', name: 'Not Taken Yet', status: 'available', draftedAtPick: null, rank: 7, tier: 4 }),
]

describe('what leaves this machine', () => {
  const board = projectBoard(session(SHEET), 5)
  const wire = JSON.stringify(board)

  it('sends the picks the room can already see', () => {
    expect(board.picks).toEqual([
      { cell: 1, name: 'Jahmyr Gibbs', position: 'RB', team: 'ATL' },
      { cell: 4, name: 'Bijan Robinson', position: 'RB', team: 'ATL' },
    ])
  })

  it('sends nothing at all from the cheat sheet', () => {
    for (const leak of ['rank', 'tier', 'risk', 'upside', 'badges', 'myGuy', 'adp']) {
      expect(wire.toLowerCase()).not.toContain(leak.toLowerCase())
    }
  })

  it('does not send players who are still available', () => {
    expect(wire).not.toContain('Not Taken Yet')
  })

  it('does not say which slot is mine', () => {
    expect(wire).not.toContain('draftSlot')
  })

  it('sends what the board needs to be drawn', () => {
    expect(board.leagueSize).toBe(10)
    expect(board.managers).toHaveLength(10)
    expect(board.rosterConfig).toEqual(ROSTER)
    expect(board.moment).toBe(5)
  })

  it('carries trades, so a watched board shows the swaps too', () => {
    const traded = projectBoard(session(SHEET, { trades: [{ a: 61, b: 66, group: 1 }] }), 5)
    expect(traded.trades).toEqual([{ a: 61, b: 66, group: 1 }])
  })
})

describe('what a viewer rebuilds', () => {
  const board = projectBoard(session(SHEET, { trades: [{ a: 61, b: 66, group: 1 }] }), 5)
  const rebuilt = boardToSession(board, 'board-id')

  it('puts every pick back in its own cell', () => {
    expect(rebuilt.players.map((p) => p.draftedAtPick).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 4])
  })

  it("lands the clock on the host's moment", () => {
    expect(currentPick(rebuilt.players, rebuilt.pickOffset)).toBe(5)
  })

  it('belongs to nobody, so no cell is highlighted as mine', () => {
    expect(rebuilt.draftSlot).toBe(0)
    expect(rebuilt.players.every((p) => p.status === 'drafted')).toBe(true)
  })

  it('has no sheet numbers to show even if something tried to', () => {
    for (const p of rebuilt.players) {
      expect(p.tier).toBeNull()
      expect(p.risk).toBeNull()
      expect(p.upside).toBeNull()
      expect(p.adpOverall).toBeNull()
      expect(p.badges).toEqual([])
    }
  })

  it('keeps the trades so the badges still draw', () => {
    expect(rebuilt.trades).toEqual([{ a: 61, b: 66, group: 1 }])
  })
})

describe('the link and the keys', () => {
  it('is off until both the project and the key are set', () => {
    expect(shareConfigured({ url: '', anonKey: '' })).toBe(false)
    expect(shareConfigured({ url: 'https://x.supabase.co', anonKey: '' })).toBe(false)
    expect(shareConfigured({ url: '  ', anonKey: 'k' })).toBe(false)
    expect(shareConfigured({ url: 'https://x.supabase.co', anonKey: 'k' })).toBe(true)
  })

  it('makes ids that cannot be confused when read aloud', () => {
    const token = randomToken(200)
    expect(token).toHaveLength(200)
    // No l/1, no O/0: these get typed in by hand.
    expect(token).not.toMatch(/[lo01]/)
  })

  it('does not hand out the same id twice', () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomToken(10)))
    expect(seen.size).toBe(200)
  })
})
