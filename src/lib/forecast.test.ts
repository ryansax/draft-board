import { describe, it, expect } from 'vitest'
import type { Player, Position, RosterConfig, Session } from '../types'
import { forecastRun, survives } from './forecast'

const ROSTER: RosterConfig = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BN: 6 }

let nextId = 0
function player(position: Position, adpOverall: number | null, o: Partial<Player> = {}): Player {
  nextId += 1
  return {
    id: `p${nextId}`,
    position,
    rank: 1,
    tier: 1,
    name: `${position}${nextId}`,
    team: 'ATL',
    adp12: null,
    adpOverall,
    risk: null,
    upside: null,
    badges: [],
    status: 'available',
    draftedAtPick: null,
    ...o,
  }
}

function session(players: Player[], o: Partial<Session> = {}): Session {
  return {
    id: 's',
    name: 'draft',
    createdAt: 0,
    updatedAt: 0,
    sheetTitle: '',
    sheetDate: null,
    leagueSize: 10,
    draftSlot: 7,
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

/** A believable middle-rounds board: plenty of skill players, defences priced late. */
function board(): Player[] {
  const players: Player[] = []
  for (let i = 0; i < 12; i++) players.push(player('RB', 35 + i * 2))
  for (let i = 0; i < 12; i++) players.push(player('WR', 36 + i * 2))
  for (let i = 0; i < 4; i++) players.push(player('QB', 60 + i * 8))
  for (let i = 0; i < 4; i++) players.push(player('TE', 70 + i * 10))
  for (let i = 0; i < 6; i++) players.push(player('DST', 140 + i * 2))
  for (let i = 0; i < 6; i++) players.push(player('K', 150 + i * 2))
  return players
}

describe('the defence problem', () => {
  /*
   * The complaint that prompted this: everybody has a hole at defence from round
   * one, and nobody takes a defence in round four. Need alone said "six managers
   * need a defence"; the market says defences go at pick 140.
   */
  it('does not have anyone taking a defence in the middle rounds', () => {
    const forecast = forecastRun(session(board()), 34, 40)
    expect(forecast.positions.map((p) => p.position)).not.toContain('DST')
    expect(forecast.positions.map((p) => p.position)).not.toContain('K')
  })

  it('does have them going once a roster runs out of spare picks', () => {
    /*
     * The last round, and slot 1 has filled everything except his defence. He has
     * one pick and one hole, so the best back left on the board is beside the
     * point — this is the round where defences go, and why.
     */
    const filled: Player[] = [
      player('QB', 1, { status: 'drafted', draftedAtPick: 1 }),
      player('RB', 2, { status: 'drafted', draftedAtPick: 20 }),
      player('RB', 3, { status: 'drafted', draftedAtPick: 21 }),
      player('WR', 4, { status: 'drafted', draftedAtPick: 40 }),
      player('WR', 5, { status: 'drafted', draftedAtPick: 41 }),
      player('TE', 6, { status: 'drafted', draftedAtPick: 60 }),
      player('K', 7, { status: 'drafted', draftedAtPick: 61 }),
      player('RB', 8, { status: 'drafted', draftedAtPick: 80 }), // the flex
      ...[81, 100, 101, 120, 121, 140].map((pick, i) =>
        player('WR', 9 + i, { status: 'drafted', draftedAtPick: pick }),
      ),
    ]
    const s = session([...filled, ...board()], { draftSlot: 7 })
    // Pick 141 opens the last round and belongs to slot 1.
    const forecast = forecastRun(s, 141, 142)
    expect(forecast.gone).toHaveLength(1)
    expect(forecast.gone[0].position).toBe('DST')
  })

  it('still reports the hole, without predicting the pick', () => {
    // The count is honest — they are short one — it just no longer drives it.
    const forecast = forecastRun(session(board()), 34, 40)
    expect(forecast.positions.every((row) => row.expected > 0)).toBe(true)
  })
})

describe('reading the rosters in front of me', () => {
  it('sends the manager who is short a quarterback after the one on the board', () => {
    /*
     * Same board, same pick, one difference: whether the man picking already has
     * his quarterback. The back is the better value either way, so if the hole
     * changes nothing the forecast is not reading rosters at all.
     */
    // The back is the marginally better value; the quarterback hole is what tips it.
    const makeBoard = () => [player('QB', 62), player('RB', 66)]

    const short = makeBoard()
    const shortForecast = forecastRun(session(short, { draftSlot: 7 }), 63, 64)

    const covered = makeBoard()
    const coveredForecast = forecastRun(
      // Pick 58 in a 10-team snake is round 6, slot 3 — the same man picking at 63.
      session([...covered, player('QB', 5, { status: 'drafted', draftedAtPick: 58 })], {
        draftSlot: 7,
      }),
      63,
      64,
    )

    expect(shortForecast.gone[0].position).toBe('QB')
    expect(coveredForecast.gone[0].position).toBe('RB')
  })

  it('will not stack a fifth running back while a starting spot is open', () => {
    const stacked = Array.from({ length: 5 }, (_, i) =>
      player('RB', 5 + i, { status: 'drafted', draftedAtPick: [8, 13, 28, 33, 48][i] }),
    )
    const pool = [player('RB', 60), player('WR', 62)]
    // Slot 8 owns picks 8, 13, 28, 33, 48 in a 10-team snake.
    const s = session([...stacked, ...pool], { draftSlot: 7 })
    const forecast = forecastRun(s, 53, 54) // pick 53 is slot 8
    expect(forecast.gone[0]?.position).toBe('WR')
  })

  it('takes the better value when a roster has no holes left to argue about', () => {
    const cheap = player('WR', 30)
    const dear = player('RB', 90)
    const forecast = forecastRun(session([cheap, dear]), 60, 61)
    expect(forecast.gone[0]).toBe(cheap)
  })
})

describe('what it hands the panel', () => {
  it('accounts for every pick in the window', () => {
    const forecast = forecastRun(session(board()), 34, 40)
    expect(forecast.picks).toBe(6)
    const spent = forecast.positions.reduce((n, row) => n + row.expected, 0)
    expect(spent).toBe(forecast.gone.length)
  })

  it('skips my own turns inside the window', () => {
    // Slot 7 picks at 37 in round 4 of a 10-team snake, so only 5 are others'.
    const forecast = forecastRun(session(board(), { draftSlot: 7 }), 34, 40)
    expect(forecast.gone.length).toBe(5)
  })

  it('orders positions by how many picks they take', () => {
    const forecast = forecastRun(session(board()), 34, 44)
    const counts = forecast.positions.map((p) => p.expected)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
  })

  it('never takes the same player twice', () => {
    const forecast = forecastRun(session(board()), 34, 50)
    expect(new Set(forecast.gone.map((p) => p.id)).size).toBe(forecast.gone.length)
  })

  it('leaves a player alone when the market has no read on him', () => {
    const unranked = player('RB', null)
    const forecast = forecastRun(session([unranked, ...board()]), 34, 44)
    expect(survives(unranked, forecast)).toBe(true)
  })

  it('says nothing when I am on the clock or the draft is done', () => {
    expect(forecastRun(session(board()), 40, 40).positions).toEqual([])
    expect(forecastRun(session(board()), 40, null).positions).toEqual([])
    expect(forecastRun(session([]), 34, 40).positions).toEqual([])
  })
})
