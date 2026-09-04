import { describe, expect, it } from 'vitest'
import { buildIndex, createLookup, isStale, normalizeName, stripSuffix, HEADSHOT_INDEX_VERSION } from './headshots'
import type { Player, Position } from '../types'

/** Sleeper-shaped records, trimmed to the fields the index actually uses. */
const RAW: Record<string, any> = {
  '7564': { full_name: "Ja'Marr Chase", search_full_name: 'jamarrchase', last_name: 'Chase', position: 'WR', team: 'CIN', active: true },
  '5848': { full_name: 'Marquise Brown', search_full_name: 'marquisebrown', last_name: 'Brown', position: 'WR', team: 'PHI', active: true },
  '7525': { full_name: 'DeVonta Smith', search_full_name: 'devontasmith', last_name: 'Smith', position: 'WR', team: 'PHI', active: true },
  '9001': { full_name: 'Audric Estime', search_full_name: 'audricestime', last_name: 'Estime', position: 'RB', team: 'NO', active: true },
  '13317': { full_name: 'Ted Hurst', search_full_name: 'tedhurst', last_name: 'Hurst', position: 'WR', team: 'TB', active: true },
  '4001': { full_name: 'Same Name', search_full_name: 'samename', last_name: 'Twin', position: 'RB', team: 'BUF', active: true },
  '4002': { full_name: 'Other Name', search_full_name: 'othername', last_name: 'Twin', position: 'RB', team: 'BUF', active: true },
  '3001': { full_name: 'Retired Guy', search_full_name: 'retiredguy', last_name: 'Guy', position: 'QB', team: null, active: false },
  '3002': { full_name: 'Retired Guy', search_full_name: 'retiredguy', last_name: 'Guy', position: 'QB', team: 'KC', active: true },
  CIN: { full_name: null, position: 'DEF', team: 'CIN' },
  // Positions we do not carry should never enter the index.
  '9999': { full_name: 'Some Lineman', search_full_name: 'somelineman', last_name: 'Lineman', position: 'OT', team: 'BUF', active: true },
}

const mk = (name: string, position: Position, team: string): Player => ({
  id: `${position}-1`, position, rank: 1, tier: 1, name, team,
  adp12: null, adpOverall: null, risk: null, upside: null, badges: [],
  status: 'available', draftedAtPick: null,
})

const lookup = createLookup(buildIndex(RAW))

describe('name normalisation', () => {
  it('matches Sleeper: lowercase, no accents, no punctuation', () => {
    expect(normalizeName("Ja'Marr Chase")).toBe('jamarrchase')
    expect(normalizeName('Audric Estimé')).toBe('audricestime')
    expect(normalizeName('Eddy Piñeiro')).toBe('eddypineiro')
    expect(normalizeName('Amon-Ra St. Brown')).toBe('amonrastbrown')
    expect(normalizeName('T.J. Hockenson')).toBe('tjhockenson')
  })

  it('strips the suffixes the sheet prints and Sleeper often omits', () => {
    expect(normalizeName(stripSuffix('Ted Hurst III'))).toBe('tedhurst')
    expect(normalizeName(stripSuffix('Harold Fannin Jr.'))).toBe('haroldfannin')
    expect(normalizeName(stripSuffix('Ollie Gordon II'))).toBe('olliegordon')
  })
})

describe('index', () => {
  it('keeps only fantasy positions', () => {
    const entries = buildIndex(RAW)
    expect(entries.some((e) => e.i === '9999')).toBe(false)
    expect(entries.some((e) => e.p === 'DEF')).toBe(true)
  })
})

describe('lookup', () => {
  it('matches on name, position and team', () => {
    expect(lookup(mk("Ja'Marr Chase", 'WR', 'CIN'))).toContain('/7564.jpg')
  })

  it('still matches when the player has changed team', () => {
    expect(lookup(mk("Ja'Marr Chase", 'WR', 'FA'))).toContain('/7564.jpg')
  })

  it('handles accents and printed suffixes', () => {
    expect(lookup(mk('Audric Estimé', 'RB', 'NO'))).toContain('/9001.jpg')
    expect(lookup(mk('Ted Hurst III', 'WR', 'TB'))).toContain('/13317.jpg')
  })

  it('resolves a nickname through a unique surname', () => {
    // The sheet prints "Hollywood Brown"; Sleeper only knows Marquise Brown.
    expect(lookup(mk('Hollywood Brown', 'WR', 'PHI'))).toContain('/5848.jpg')
  })

  it('refuses to guess when a surname is ambiguous', () => {
    expect(lookup(mk('Nickname Twin', 'RB', 'BUF'))).toBeNull()
  })

  it('prefers the active player when a name repeats', () => {
    expect(lookup(mk('Retired Guy', 'QB', 'KC'))).toContain('/3002.jpg')
  })

  it('uses the team logo for a defense', () => {
    expect(lookup(mk('Cincinnati Bengals', 'DST', 'CIN'))).toContain('team_logos/nfl/cin.png')
  })

  it('returns null for someone it does not know', () => {
    expect(lookup(mk('Nobody At All', 'TE', 'SEA'))).toBeNull()
  })
})

describe('cache freshness', () => {
  it('refetches when missing, old or from a previous shape', () => {
    expect(isStale(null)).toBe(true)
    expect(isStale({ version: HEADSHOT_INDEX_VERSION, fetchedAt: Date.now(), entries: [] })).toBe(false)
    expect(isStale({ version: HEADSHOT_INDEX_VERSION, fetchedAt: Date.now() - 25 * 3600_000, entries: [] })).toBe(true)
    expect(isStale({ version: HEADSHOT_INDEX_VERSION - 1, fetchedAt: Date.now(), entries: [] })).toBe(true)
  })
})
