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

  it('expands the club and carries the numbers off the sheet', () => {
    const c = buildAnalysisContext(s, taken, 20)
    expect(c.team).toBe('Detroit Lions')
    expect(c.positionRank).toBe(4)
    expect(c.tier).toBe(2)
    expect(c.risk).toBe(3.1)
    expect(c.upside).toBe(9.4)
    expect(c.badges).toEqual(['myGuy'])
  })

  it('names the next man up at the position', () => {
    expect(buildAnalysisContext(s, taken, 20).nextBestAtPosition).toBe('Next Back (RB5)')
  })

  it('counts what is left of his tier', () => {
    const c = buildAnalysisContext(s, taken, 20)
    expect(c.tierTotal).toBe(3)
    expect(c.tierRemaining).toBe(2)
  })

  it('leaves the drafted player out of his own manager history', () => {
    const c = buildAnalysisContext(s, taken, 20)
    expect(c.managerPositionsSoFar).not.toContain('RB')
  })

  it('copes with a player who has no ADP', () => {
    const noAdp = mk('K', 1, { adpOverall: null, tier: null, risk: null, upside: null })
    const c = buildAnalysisContext(session([noAdp]), noAdp, 145)
    expect(c.adpOverall).toBeNull()
    expect(c.adpDelta).toBeNull()
    expect(c.tierRemaining).toBeNull()
  })
})

describe('the prompt', () => {
  it('forbids inventing anything the sheet does not contain', () => {
    // The model has no access to this season, and would otherwise fill the gap.
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/must not imply/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/Never invent/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/two sentences at most/i)
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
