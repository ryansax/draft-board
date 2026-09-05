import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisContext,
  buildAnalysisPrompt,
  coerceAnalysis,
  marketValueFor,
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

  it('describes the market in words, never a figure', () => {
    const c = buildAnalysisContext(s, taken, 20)
    // ADP said pick 12; he went at 20 — under a round later, in a 10-team league.
    expect(c.marketValue).toBe('later than the market usually takes him')
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
    expect(c.marketValue).toBe('no real market for him')
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

  it('still sends what is public: the player, his club, and the market in words', () => {
    expect(context.playerName).toBe('Bijan Robinson')
    expect(context.team).toBe('Detroit Lions')
    expect(context.marketValue).toBe('about where the market takes him')
    expect(context.overallPick).toBe(20)
  })

  it('sends no ADP figure the model could read out', () => {
    expect(payload).not.toContain('adpOverall')
    expect(payload).not.toContain('adpDelta')
    // The sheet's ADP for this player is 20; it must not appear as a value.
    expect(JSON.stringify(context.marketValue)).not.toMatch(/\d/)
  })
})

describe('the prompt', () => {
  it('forbids inventing current-season specifics', () => {
    // It has no access to this season and would otherwise fill the gap.
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/out of date/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/never invent/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/or quote a statistic/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/two sentences at most/i)
  })

  it('forbids referring to rankings or tiers even in passing', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/Never mention a player ranking, a tier/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/my guy/i)
  })

  it('invites club and role context', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/his role, the offence around him/i)
  })

  it('stops the value being the opening line every time', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/Worth leading with maybe one pick in four/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/never invent one/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/no pick counts/i)
  })

  it('puts the player ahead of the roster he landed on', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/Lead with the player/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/not about the roster he landed on/i)
    // Roster fit is demoted to an occasional angle, not the default one.
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/The other angles are seasoning, not the meal/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/Do not narrate a roster back to the room/i)
  })

  it('wants teammates named, in the "what has to happen" frame', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/The rest of his offence, by name/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/A queue he has to jump/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/A backup quarterback is only worth a roster spot/i)
    // A named teammate is only safe as a condition, never as today's depth chart.
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/naming teammates is wanted, asserting today's depth chart is not/i)
    // A wrong name is worse than no name.
    // Teammates now come from a live roster feed, so memory is not allowed a vote.
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(
      /Never name a teammate who is not in the lists you were given/i,
    )
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(
      /You may only name a teammate who appears in "teammatesAtHisPosition" or "quarterbacks"/i,
    )
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/talk about the situation without naming anybody/i)
  })

  it('covers the unsettled pecking order, not just a queue to jump', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/An unsettled pecking order/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/nobody sure which of them becomes the go-to target/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/name both, and frame it as the open question it is/i)
    // Who is throwing him the ball is part of the picture.
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/Who is getting him the ball/i)
    // Wanted when it fits, not forced onto every pick.
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/Not every pick — reach for this when the situation calls for it/i)
  })

  it('frames the hedging as stale knowledge, not as privacy', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/This is a limit on your knowledge, not a secret being kept/i)
  })

  it('will scold a bad pick instead of hedging it', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/When a pick is genuinely bad, say so and do not soften it/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/that earns a scolding/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/your take should sound like a Reach/i)
    // Harsh about the decision, never about the human being.
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/the target is always the pick and the roster, never the manager as a person/i)
  })

  it('asks for the ceiling, the risk, and who he is competing with', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/The ceiling/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/What would have to go wrong/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/The rest of his offence, by name/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/in and out of the lineup/i)
  })

  it('allows a career injury pattern but not a claim about today', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/A career-long pattern is yours to use/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/never got through a season intact/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(
      /never do is assert a current or recent injury, trade, suspension, holdout or coaching change as fact/i,
    )
    // Depth charts turn over every year, so they have to be hedged.
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/as a condition, a question or a reputation, never as a flat statement about today/i)
  })

  it("is clear the player read is the model's own, not from the sheet", () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/none of it is given to you/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/Your read on a player is your own/i)
    // The words "risk" and "upside" may appear as football talk, but never as scores.
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/a rating, a risk or upside score/i)
  })

  it('lets it rib the players, reputation only', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/rib the players/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/long-standing reputation/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/assert a current or recent injury/i)
  })

  it('asks for humour on about half the picks now, not a third', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/roughly every other pick/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/on even numbers lean into the joke/i)
  })

  it('keeps the ribbing aimed at the pick, not the person', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/the target is always the pick and the roster, never the manager as a person/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/never anything personal or cruel/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/never their character, appearance or intelligence/i)
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/do not escalate a crude team name/i)
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

describe('marketValueFor', () => {
  const TEN = 10

  it('reads a long fall as a bargain and a long reach as a reach', () => {
    // ADP 12, taken at 40 — nearly three rounds later.
    expect(marketValueFor(12, 40, TEN)).toBe('a long way later than the market usually takes him')
    // ADP 120, taken at 13 — the "107 spots early" case that started this.
    expect(marketValueFor(120, 13, TEN)).toBe(
      'a long way ahead of where the market usually takes him',
    )
  })

  it('treats half a round either side as about right', () => {
    expect(marketValueFor(20, 20, TEN)).toBe('about where the market takes him')
    expect(marketValueFor(20, 24, TEN)).toBe('about where the market takes him')
    expect(marketValueFor(20, 16, TEN)).toBe('about where the market takes him')
  })

  it('separates a modest fall from a modest reach', () => {
    expect(marketValueFor(20, 27, TEN)).toBe('later than the market usually takes him')
    expect(marketValueFor(20, 13, TEN)).toBe('earlier than the market usually takes him')
  })

  it('says so plainly when there is no ADP at all', () => {
    expect(marketValueFor(null, 140, TEN)).toBe('no real market for him')
  })

  it('scales with league size, so a round means a round', () => {
    // Eight picks is more than a round in an 8-team league, less in a 14.
    expect(marketValueFor(10, 22, 8)).toBe('a long way later than the market usually takes him')
    expect(marketValueFor(10, 22, 14)).toBe('later than the market usually takes him')
  })

  it('never returns anything with a digit in it', () => {
    for (const pick of [1, 13, 40, 120, 200]) {
      expect(marketValueFor(50, pick, TEN)).not.toMatch(/\d/)
    }
  })
})

describe('the prompt, on current facts', () => {
  it('tells the model the roster feed beats its memory', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(
      /They are today's truth and they override anything you think you remember/i,
    )
  })

  it('makes it take career stage from the fact, not recollection', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(
      /Use "experience" for where he is in his career and never your own recollection/i,
    )
    expect(ANALYSIS_SYSTEM_PROMPT).toMatch(/he is not a rookie and has taken snaps/i)
  })
})
