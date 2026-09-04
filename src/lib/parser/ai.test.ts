import { describe, expect, it } from 'vitest'
import { coerceBadgeRows, mergeBadges } from './ai'
import type { Player } from '../../types'

const player = (overrides: Partial<Player>): Player => ({
  id: 'QB-1', position: 'QB', rank: 1, tier: 1, name: 'Josh Allen', team: 'BUF',
  adp12: '2.03', adpOverall: 15, risk: 2.6, upside: 9.7, badges: [],
  status: 'available', draftedAtPick: null, ...overrides,
})

describe('coerceBadgeRows', () => {
  it('reads strict JSON', () => {
    const rows = coerceBadgeRows('{"players":[{"position":"QB","rank":1,"name":"Josh Allen","badges":["myGuy"]}]}')
    expect(rows).toEqual([{ position: 'QB', rank: 1, name: 'Josh Allen', badges: ['myGuy'] }])
  })

  it('tolerates a markdown fence or surrounding prose', () => {
    const rows = coerceBadgeRows('Here you go:\n```json\n{"players":[{"position":"RB","rank":2,"name":"X","badges":["sleeper"]}]}\n```')
    expect(rows).toHaveLength(1)
    expect(rows[0].badges).toEqual(['sleeper'])
  })

  it('drops unknown badges, bad positions and empty badge lists', () => {
    const rows = coerceBadgeRows('{"players":[' +
      '{"position":"QB","rank":1,"badges":["myGuy","nonsense"]},' +
      '{"position":"XX","rank":1,"badges":["myGuy"]},' +
      '{"position":"WR","rank":2,"badges":[]}]}')
    expect(rows).toEqual([{ position: 'QB', rank: 1, name: '', badges: ['myGuy'] }])
  })

  it('returns nothing for unparseable output', () => {
    expect(coerceBadgeRows('sorry, I cannot help')).toEqual([])
    expect(coerceBadgeRows('{ broken')).toEqual([])
  })
})

describe('mergeBadges', () => {
  const players = [player({}), player({ id: 'RB-1', position: 'RB', name: 'Bijan Robinson' })]

  it('adds badges without touching numeric fields', () => {
    const { players: merged } = mergeBadges(players, [
      { position: 'QB', rank: 1, name: 'Josh Allen', badges: ['myGuy', 'breakout'] },
    ])
    expect(merged[0].badges).toEqual(['myGuy', 'breakout'])
    expect(merged[0].adp12).toBe('2.03')
    expect(merged[0].risk).toBe(2.6)
    expect(merged[1].badges).toEqual([])
  })

  it('does not mutate the input', () => {
    mergeBadges(players, [{ position: 'QB', rank: 1, name: 'Josh Allen', badges: ['value'] }])
    expect(players[0].badges).toEqual([])
  })

  it('flags a name disagreement but still applies the badges', () => {
    const { players: merged, issues } = mergeBadges(players, [
      { position: 'QB', rank: 1, name: 'Jash Ellen', badges: ['bust'] },
    ])
    expect(merged[0].badges).toEqual(['bust'])
    expect(issues[0].level).toBe('warning')
    expect(issues[0].message).toMatch(/Jash Ellen/)
  })

  it('ignores rows that do not exist on the sheet', () => {
    const { players: merged, issues } = mergeBadges(players, [
      { position: 'TE', rank: 99, name: 'Nobody', badges: ['sleeper'] },
    ])
    expect(merged.every((p) => p.badges.length === 0)).toBe(true)
    expect(issues[0].message).toMatch(/not on the sheet/)
  })

  it('accepts punctuation and case differences in names', () => {
    const { issues } = mergeBadges(players, [
      { position: 'RB', rank: 1, name: 'bijan robinson', badges: ['rookie'] },
    ])
    expect(issues).toEqual([])
  })
})
