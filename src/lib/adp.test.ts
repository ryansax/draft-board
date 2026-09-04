import { describe, expect, it } from 'vitest'
import {
  adp12ToOverall,
  adpLabel,
  adpTooltip,
  availabilityFor,
  byAdpOverall,
  convertAdp,
  isFallingValue,
  myPicks,
  nextPickAtOrAfter,
  overallToRoundPick,
  pickForRound,
} from './adp'

describe('adp12ToOverall', () => {
  it('converts round.pick to an overall pick number', () => {
    expect(adp12ToOverall('1.01')).toBe(1)
    expect(adp12ToOverall('1.12')).toBe(12)
    expect(adp12ToOverall('2.01')).toBe(13)
    expect(adp12ToOverall('3.06')).toBe(30)
    expect(adp12ToOverall('12.01')).toBe(133)
  })

  it('handles rounds past 20', () => {
    expect(adp12ToOverall('34.04')).toBe(400)
  })

  it('returns null for a missing ADP', () => {
    expect(adp12ToOverall('-')).toBeNull()
    expect(adp12ToOverall(null)).toBeNull()
    expect(adp12ToOverall(undefined)).toBeNull()
    expect(adp12ToOverall('')).toBeNull()
  })

  it('rejects malformed values', () => {
    expect(adp12ToOverall('1.1')).toBeNull()
    expect(adp12ToOverall('1.13')).toBeNull()
    expect(adp12ToOverall('0.05')).toBeNull()
    expect(adp12ToOverall('abc')).toBeNull()
  })
})

describe('league size conversion (section 5 worked examples)', () => {
  it('Omarion Hampton 1.12 -> overall 12 -> 10-team 2.02', () => {
    const c = convertAdp('1.12', 10)!
    expect(c.overall).toBe(12)
    expect(c.label).toBe('2.02')
  })

  it('Jared Goff 12.01 -> overall 133 -> 10-team 14.03', () => {
    const c = convertAdp('12.01', 10)!
    expect(c.overall).toBe(133)
    expect(c.label).toBe('14.03')
  })

  it('Brock Bowers 3.06 -> overall 30 -> 10-team 3.10', () => {
    const c = convertAdp('3.06', 10)!
    expect(c.overall).toBe(30)
    expect(c.label).toBe('3.10')
  })

  it('a "-" ADP converts to null', () => {
    expect(convertAdp('-', 10)).toBeNull()
    expect(convertAdp(null, 10)).toBeNull()
  })

  it('is a no-op at 12 teams', () => {
    expect(convertAdp('3.06', 12)!.label).toBe('3.06')
    expect(convertAdp('12.01', 12)!.label).toBe('12.01')
  })

  it('converts for other league sizes', () => {
    expect(convertAdp('1.12', 8)!.label).toBe('2.04')
    expect(convertAdp('1.12', 14)!.label).toBe('1.12')
    expect(overallToRoundPick(28, 14).label).toBe('2.14')
    expect(overallToRoundPick(29, 14).label).toBe('3.01')
  })
})

describe('whole-number ADP display', () => {
  it('shows the overall pick number, which needs no league-size conversion', () => {
    expect(adpLabel(adp12ToOverall('1.12'))).toBe('12')
    expect(adpLabel(adp12ToOverall('12.01'))).toBe('133')
    expect(adpLabel(adp12ToOverall('3.06'))).toBe('30')
  })

  it('renders a missing ADP as a dash', () => {
    expect(adpLabel(null)).toBe('-')
    expect(adpLabel(adp12ToOverall('-'))).toBe('-')
  })

  it('keeps the sheet notation and league round in the tooltip', () => {
    expect(adpTooltip('3.06', 30, 10)).toBe(
      'ADP: pick 30 overall · 3.06 on the 12-team sheet · round 3.10 in your 10-team',
    )
  })

  it('drops the league round from the tooltip at 12 teams', () => {
    expect(adpTooltip('3.06', 30, 12)).toBe('ADP: pick 30 overall · 3.06 on the 12-team sheet')
  })

  it('says so when there is no ADP', () => {
    expect(adpTooltip(null, null, 10)).toBe('No ADP on the sheet')
  })
})

describe('snake draft math', () => {
  it('10-team, slot 3 -> picks 3, 18, 23, 38, 43', () => {
    expect(myPicks(10, 3, 5)).toEqual([3, 18, 23, 38, 43])
  })

  it('turns at slot 1 and slot N', () => {
    expect(myPicks(10, 1, 4)).toEqual([1, 20, 21, 40])
    expect(myPicks(10, 10, 4)).toEqual([10, 11, 30, 31])
  })

  it('works for 12- and 14-team leagues', () => {
    expect(myPicks(12, 7, 3)).toEqual([7, 18, 31])
    expect(pickForRound(4, 14, 5)).toBe(52)
  })

  it('finds my next pick', () => {
    const picks = myPicks(10, 3, 16)
    expect(nextPickAtOrAfter(picks, 1)).toBe(3)
    expect(nextPickAtOrAfter(picks, 3)).toBe(3)
    expect(nextPickAtOrAfter(picks, 4)).toBe(18)
    expect(nextPickAtOrAfter(picks, 19)).toBe(23)
    expect(nextPickAtOrAfter([3, 18], 19)).toBeNull()
  })
})

describe('availability prediction', () => {
  it('flags a safe wait at delta >= +5', () => {
    expect(availabilityFor(23, 18)).toBe('safe')
    expect(availabilityFor(28, 18)).toBe('safe')
  })

  it('flags a coin flip between -4 and +4', () => {
    expect(availabilityFor(22, 18)).toBe('coinflip')
    expect(availabilityFor(18, 18)).toBe('coinflip')
    expect(availabilityFor(14, 18)).toBe('coinflip')
  })

  it('flags likely gone at delta <= -5', () => {
    expect(availabilityFor(13, 18)).toBe('gone')
    expect(availabilityFor(1, 18)).toBe('gone')
  })

  it('stays quiet outside the relevant window and without an ADP', () => {
    expect(availabilityFor(31, 18)).toBeNull()
    expect(availabilityFor(null, 18)).toBeNull()
    expect(availabilityFor(23, null)).toBeNull()
  })
})

describe('falling value', () => {
  it('flags a player the market expected gone', () => {
    expect(isFallingValue(10, 16)).toBe(true)
    expect(isFallingValue(10, 15)).toBe(false)
    expect(isFallingValue(20, 16)).toBe(false)
    expect(isFallingValue(null, 60)).toBe(false)
  })
})

describe('byAdpOverall', () => {
  it('sorts ascending with null last', () => {
    const list = [{ adpOverall: null }, { adpOverall: 30 }, { adpOverall: 5 }, { adpOverall: null }]
    expect(list.sort(byAdpOverall).map((p) => p.adpOverall)).toEqual([5, 30, null, null])
  })
})
