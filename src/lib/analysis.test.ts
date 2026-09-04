import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisContext,
  buildAnalysisPrompt,
  coerceAnalysis,
} from './analysis'
import { DEFAULT_ROSTER, defaultManagers, type Player, type Position, type Session } from '../types'

function mk(position: Position, rank: number, o: Partial<Player> = {}): Player {
  return {
    id: `${position}-${rank}`, position, rank, tier: 3, name: `${position}${rank}`,
    team: 'DET', adp12: null, adpOverall: 20, risk: 5, upside: 8, badges: [],
    status: 'available', draftedAtPick: null, ...o,
  }
}

function session(players: Player[]): Session {
  return {
    id: 's', name: 'test', createdAt: 0, updatedAt: 0, sheetTitle: '', sheetDate: null,
    leagueSize: 10, draftSlot: 3, managers: defaultManagers(10, 3),
    rosterConfig: DEFAULT_ROSTER, players, undoStack: [], pickOffset: 0, dismissedTierAlerts: [],
  }
}

describe('buildAnalysisContext', () => {
  const taken = mk('RB', 4, { name: 'Bijan Robinson', adpOverall: 12, status: 'drafted', draftedAtPick: 20, tier: 2, risk: 3.1, upside: 9.4, badges: ['myGuy'] })
  const s = session([
    taken,
    mk('RB', 5, { name: 'Next Back', tier: 2 }),
    mk('RB', 6, { name: 'Later Back', tier: 2 }),
    mk('WR', 1, { name: 'Some Receiver', status: 'drafted', draftedAtPick: 10 }),
  ])

  it('reports where the pick landed relative to ADP', () => {
    const c = buildAnalysisContext(s, taken, 20)
    // ADP said pick 12; he went at 20, so he lasted 8 picks longer.
    expect(c.adpDelta).toBe(8)
    expect(c.overallPick).toBe(20)
    expect(c.round).toBe(2)
    expect(c.pickInRound).toBe(10)
  })

  it('expands the club for the voice', () => {
    expect(buildAnalysisContext(s, taken, 20).team).toBe('Detroit Lions')
  })

  it('keeps what the room can already see on the board', () => {
    const c = buildAnalysisContext(s, taken, 20)
    // Round 2 snakes back, so pick 20 belongs to slot 1.
    expect(c.managerName).toBe('Team 1')
    expect(Array.isArray(c.managerStillNeeds)).toBe(true)
  })

  it('leaves the drafted player out of his own manager history', () => {
    expect(buildAnalysisContext(s, taken, 20).managerPositionsSoFar).not.toContain('RB')
  })

  it('copes with a player who has no ADP', () => {
    const noAdp = mk('K', 1, { adpOverall: null, tier: null, risk: null, upside: null })
    const c = buildAnalysisContext(session([noAdp]), noAdp, 145)
    expect(c.adpOverall).toBeNull()
    expect(c.adpDelta).toBeNull()
  })
})

describe('nothing private reaches the model', () => {
  // The take is shown on the room display, so the owner's own draft prep — the
  // sheet's ranks and tiers, its risk and upside scores, and the badges marking
  // his guys — must never be in the payload.
  const secretive = mk('RB', 4, {
    name: 'Bijan Robinson', tier: 2, risk: 3.1, upside: 9.4,
    badges: ['myGuy', 'sleeper'], status: 'drafted', draftedAtPick: 20,
  })
  const s2 = session([secretive, mk('RB', 5, { name: 'Next Back' })])
  const context = buildAnalysisContext(s2, secretive, 20)
  const payload = JSON.stringify(context)

  it('sends no rank, tier, risk, upside or badges', () => {
    for (const banned of ['positionRank', 'tier', 'risk', 'upside', 'badges', 'nextBest']) {
      expect(payload, `"${banned}" must not be sent`).not.toContain(banned)
    }
  })

  it('does not leak the values themselves, even unlabelled', () => {
    expect(payload).not.toContain('myGuy')
    expect(payload).not.toContain('sleeper')
    expect(payload).not.toContain('9.4')
    expect(payload).not.toContain('3.1')
    // Rank 4 must not appear as a bare field value anywhere.
    expect(Object.values(context)).not.toContain(4)
  })

  it('still sends what is public: the player, his club, and the market', () => {
    expect(context.playerName).toBe('Bijan Robinson')
    expect(context.team).toBe('Detroit Lions')
    expect(context.adpOverall).toBe(20)
    expect(context.overallPick).toBe(20)
  })
})

describe('the prompt', () => {
  it('forbids inventing current-season specifics', () => {
    // It has no access to this season and would otherwise fill the gap.
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/out of date/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/never invent/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/never quote a statistic/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/two sentences at most/i)
  })

  it('forbids referring to rankings or tiers even in passing', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/Never mention a player ranking, a tier/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/my guy/i)
  })

  it('invites club and role context, which is the point of the change', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/his role, the offence around him/i)
  })

  it('hands over the facts as data', () => {
    const s = session([mk('RB', 1)])
    const prompt = buildAnalysisPrompt(buildAnalysisContext(s, s.players[0], 5))
    expect(() => JSON.parse(prompt.slice(prompt.indexOf('{')))).not.toThrow()
  })
})

describe('coerceAnalysis', () => {
  it('accepts a well-formed take', () => {
    expect(coerceAnalysis({ verdict: 'Steal', take: 'He fell a full round.' }))
      .toEqual({ verdict: 'Steal', take: 'He fell a full round.' })
  })

  it('falls back to a neutral verdict rather than showing a made-up one', () => {
    expect(coerceAnalysis({ verdict: 'Cataclysm', take: 'Bold.' })?.verdict).toBe('Solid')
  })

  it('caps a take that would overrun the screen', () => {
    const long = coerceAnalysis({ verdict: 'Fair', take: 'x'.repeat(500) })!
    expect(long.take.length).toBeLessThanOrEqual(320)
    expect(long.take.endsWith('…')).toBe(true)
  })

  it('rejects anything without usable text', () => {
    expect(coerceAnalysis({ verdict: 'Fair', take: '   ' })).toBeNull()
    expect(coerceAnalysis(null)).toBeNull()
    expect(coerceAnalysis('nope')).toBeNull()
    expect(coerceAnalysis({})).toBeNull()
  })
})
