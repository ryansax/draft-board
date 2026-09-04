import { describe, expect, it } from 'vitest'
import {
  buildOnTheClockAnnouncement,
  buildPickAnnouncement,
  lastNameOf,
  ordinalWord,
  phraseEndTime,
  type Alignment,
} from './announce'
import { teamFullName } from './nflTeams'
import type { Player, Position } from '../types'

const mk = (name: string, position: Position, team: string): Player => ({
  id: `${position}-1`, position, rank: 1, tier: null, name, team,
  adp12: null, adpOverall: null, risk: null, upside: null, badges: [],
  status: 'available', draftedAtPick: null,
})

/** Build an alignment as the API would: one entry per character. */
function alignmentFor(text: string, secondsPerChar = 0.05): Alignment {
  const characters = [...text]
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => +(i * secondsPerChar).toFixed(4)),
    character_end_times_seconds: characters.map((_, i) => +((i + 1) * secondsPerChar).toFixed(4)),
  }
}

describe('ordinalWord', () => {
  it('spells out the ordinals a draft actually reaches', () => {
    expect([1, 2, 3, 5, 11, 12, 14].map(ordinalWord)).toEqual([
      'first', 'second', 'third', 'fifth', 'eleventh', 'twelfth', 'fourteenth',
    ])
  })

  it('handles the twenties and thirties', () => {
    expect(ordinalWord(20)).toBe('twentieth')
    expect(ordinalWord(21)).toBe('twenty-first')
    expect(ordinalWord(30)).toBe('thirtieth')
  })
})

describe('teamFullName', () => {
  it('expands a code for the voice', () => {
    expect(teamFullName('DET')).toBe('Detroit Lions')
    expect(teamFullName('SF')).toBe('San Francisco 49ers')
    expect(teamFullName('FA')).toBe('free agency')
  })

  it('passes an unknown code through rather than inventing one', () => {
    expect(teamFullName('ZZZ')).toBe('ZZZ')
  })
})

describe('buildPickAnnouncement', () => {
  it('reads like a commissioner at the podium', () => {
    const a = buildPickAnnouncement(mk('Bijan Robinson', 'RB', 'ATL'), "Leo's Bus Drivers", 2, 5)
    expect(a.text).toBe(
      "With the fifth pick of the second round, Leo's Bus Drivers selects Bijan Robinson. Running back from the Atlanta Falcons.",
    )
    expect(a.revealAfter).toBe('Robinson')
  })

  it('does not say "defense" twice for a defense', () => {
    const a = buildPickAnnouncement(mk('Houston Texans', 'DST', 'HOU'), 'Feeld Goals', 14, 3)
    expect(a.text).toBe(
      'With the third pick of the fourteenth round, Feeld Goals selects the Houston Texans defense.',
    )
    expect(a.revealAfter).toBe('Houston Texans')
  })

  it('reveals on the full surname, suffix and all', () => {
    expect(buildPickAnnouncement(mk('Amon-Ra St. Brown', 'WR', 'DET'), 'T', 1, 1).revealAfter)
      .toBe('St. Brown')
    expect(lastNameOf('James Cook III')).toBe('Cook III')
    expect(lastNameOf('Prime')).toBe('Prime')
  })

  it('announces who is up next', () => {
    expect(buildOnTheClockAnnouncement('4th & Foreskin')).toBe('4th & Foreskin is on the clock.')
  })
})

describe('phraseEndTime', () => {
  const text = 'With the first pick, Dave selects Bijan Robinson. Running back from the Atlanta Falcons.'
  const alignment = alignmentFor(text)

  it('returns the moment the surname finishes', () => {
    const end = phraseEndTime(alignment, 'Robinson')!
    const expected = (text.indexOf('Robinson') + 'Robinson'.length) * 0.05
    expect(end).toBeCloseTo(expected, 3)
  })

  it('ignores punctuation and spacing differences', () => {
    const spoken = alignmentFor('Dave selects Amon-Ra St. Brown. Wide receiver.')
    expect(phraseEndTime(spoken, 'St. Brown')).toBeGreaterThan(0)
    expect(phraseEndTime(spoken, 'st brown')).toBeGreaterThan(0)
  })

  it('takes the last occurrence when a name repeats', () => {
    const spoken = alignmentFor('Houston Texans. The Houston Texans defense.')
    const end = phraseEndTime(spoken, 'Houston Texans')!
    expect(end).toBeCloseTo((spoken.characters.length - ' defense.'.length) * 0.05, 3)
  })

  it('returns null instead of guessing when it cannot find the phrase', () => {
    expect(phraseEndTime(alignment, 'Mahomes')).toBeNull()
    expect(phraseEndTime(null, 'Robinson')).toBeNull()
    expect(phraseEndTime(alignment, '   ')).toBeNull()
  })

  it('returns null on a malformed alignment rather than throwing', () => {
    expect(phraseEndTime({ characters: ['a'], character_start_times_seconds: [0], character_end_times_seconds: [] }, 'a')).toBeNull()
  })
})
