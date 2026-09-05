import { describe, it, expect } from 'vitest'
import sample from './__fixtures__/sleeper-sample.json'
import { buildIndex } from './headshots'
import { createSquadLookup, experiencePhrase } from './squad'
import { buildAnalysisContext } from './analysis'
import type { Player, Position, Session } from '../types'

/*
 * The fixture is a slice of the real Sleeper feed, kept because it pins the two
 * mistakes the analyst actually made on air: it put David Montgomery in Detroit
 * after he had moved to Houston, and called Cam Ward a rookie who had not taken
 * a snap when he had a season behind him.
 */
const squad = createSquadLookup(buildIndex(sample as Record<string, unknown>))
const player = (name: string, position: Position, team: string) =>
  ({ id: name, name, position, team }) as Player

describe('current roster facts', () => {
  it('does not put a departed team-mate back in the backfield', () => {
    const facts = squad(player('Jahmyr Gibbs', 'RB', 'DET'))!
    // Montgomery is on Houston in the fixture, so he must not be offered.
    expect(facts.samePosition).not.toContain('David Montgomery')
    expect(facts.samePosition).toContain('Isiah Pacheco')
    expect(facts.samePosition).toContain('Sione Vaki')
  })

  it('says who is throwing him the ball', () => {
    expect(squad(player('Jahmyr Gibbs', 'RB', 'DET'))!.quarterbacks).toEqual(['Jared Goff'])
  })

  it('does not hand a quarterback a list of quarterbacks', () => {
    expect(squad(player('Cam Ward', 'QB', 'TEN'))!.quarterbacks).toEqual([])
  })

  it('leaves the player himself out of his own team-mates', () => {
    expect(squad(player('Jahmyr Gibbs', 'RB', 'DET'))!.samePosition).not.toContain('Jahmyr Gibbs')
  })

  it('knows a second-year player is not a rookie', () => {
    const facts = squad(player('Cam Ward', 'QB', 'TEN'))!
    expect(facts.seasonsPlayed).toBe(1)
    expect(experiencePhrase(1)).toBe('in his second NFL season, with one season behind him')
  })

  it('spells experience out across the range', () => {
    expect(experiencePhrase(0)).toBe('a rookie who has not played an NFL season yet')
    expect(experiencePhrase(2)).toBe('in his third NFL season')
    expect(experiencePhrase(5)).toBe('5 seasons into his career')
    expect(experiencePhrase(10)).toBe('a veteran, 10 seasons in')
    expect(experiencePhrase(null)).toBeNull()
  })

  it('returns nothing rather than guessing for an unknown club', () => {
    expect(squad(player('Nobody At All', 'RB', 'XXX'))).toBeNull()
    expect(squad(player('Some Defence', 'DST', 'DET'))).toBeNull()
  })
})

describe('what reaches the model', () => {
  const session = {
    leagueSize: 10,
    draftSlot: 1,
    managers: ['Me'],
    picks: [],
    rosterConfig: { QB: 1, RB: 2, WR: 2, TE: 1, DST: 1, K: 1, BN: 6 },
    players: [],
  } as unknown as Session

  it('carries the current team-mates and the real experience', () => {
    const ctx = buildAnalysisContext(session, player('Jahmyr Gibbs', 'RB', 'DET'), 3, squad)
    expect(ctx.teammatesAtHisPosition).toContain('Isiah Pacheco')
    expect(JSON.stringify(ctx)).not.toContain('David Montgomery')
    expect(ctx.experience).toBe('3 seasons into his career')
  })

  it('omits the fields entirely when the roster has not loaded', () => {
    const ctx = buildAnalysisContext(session, player('Jahmyr Gibbs', 'RB', 'DET'), 3, null)
    // Absent, not empty: an empty list reads as "he has no team-mates".
    expect('teammatesAtHisPosition' in ctx).toBe(false)
    expect('experience' in ctx).toBe(false)
  })

  it('still sends nothing from the cheat sheet', () => {
    const ctx = buildAnalysisContext(session, player('Cam Ward', 'QB', 'TEN'), 3, squad)
    const payload = JSON.stringify(ctx)
    for (const leak of ['tier', 'rank', 'upside', 'risk', 'adp']) {
      expect(payload.toLowerCase()).not.toContain(leak)
    }
  })
})
