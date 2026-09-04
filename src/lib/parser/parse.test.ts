import { describe, expect, it, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { extractPages } from './extract'
import { buildBadgeLegend, parseSheet } from './parse'
import type { ParsedSheet } from './types'
import { BADGES, type Player, type Position } from '../../types'

let sheet: ParsedSheet
let pages: Awaited<ReturnType<typeof extractPages>>

const find = (position: Position, rank: number): Player => {
  const p = sheet.players.find((x) => x.position === position && x.rank === rank)
  if (!p) throw new Error(`no ${position} rank ${rank}`)
  return p
}
const byPosition = (position: Position) => sheet.players.filter((p) => p.position === position)

beforeAll(async () => {
  const file = path.resolve(process.cwd(), 'fixtures/cheatsheet-sample.pdf')
  const data = new Uint8Array(fs.readFileSync(file))
  const doc = await getDocument({ data, useSystemFonts: true }).promise
  pages = await extractPages(doc, OPS)
  sheet = parseSheet(pages)
}, 30_000)

describe('sheet header', () => {
  it('parses the sheet date', () => {
    expect(sheet.sheetDate).toBe('2026-08-28')
  })

  it('parses a sheet title', () => {
    expect(sheet.sheetTitle).toMatch(/Redraft Rankings/)
  })
})

describe('parse quality', () => {
  it('produces no validation errors', () => {
    expect(sheet.issues.filter((i) => i.level === 'error')).toEqual([])
  })

  it('leaves no unparsed rows', () => {
    expect(sheet.unparsed).toEqual([])
  })

  it('gives every player a name and a team', () => {
    const bad = sheet.players.filter((p) => !p.name || !p.team)
    expect(bad).toEqual([])
  })

  it('keeps ranks contiguous within every position', () => {
    for (const position of ['QB', 'RB', 'WR', 'TE', 'DST', 'K'] as Position[]) {
      const ranks = byPosition(position).map((p) => p.rank)
      expect(ranks, position).toEqual(ranks.map((_, i) => i + 1))
    }
  })

  it('keeps risk and upside inside 1.0-10.0', () => {
    for (const p of sheet.players) {
      if (p.risk !== null) expect(p.risk, p.name).toBeGreaterThanOrEqual(1)
      if (p.risk !== null) expect(p.risk, p.name).toBeLessThanOrEqual(10)
      if (p.upside !== null) expect(p.upside, p.name).toBeGreaterThanOrEqual(1)
      if (p.upside !== null) expect(p.upside, p.name).toBeLessThanOrEqual(10)
    }
  })
})

describe('known rows (acceptance criteria)', () => {
  it('QB 1 is Josh Allen (BUF) 2.03 / 2.6 / 9.7', () => {
    const p = find('QB', 1)
    expect(p.name).toBe('Josh Allen')
    expect(p.team).toBe('BUF')
    expect(p.adp12).toBe('2.03')
    expect(p.adpOverall).toBe(15)
    expect(p.risk).toBe(2.6)
    expect(p.upside).toBe(9.7)
    expect(p.tier).toBe(1)
  })

  it('RB 12 is Ashton Jeanty (LV) with risk 10.0', () => {
    const p = find('RB', 12)
    expect(p.name).toBe('Ashton Jeanty')
    expect(p.team).toBe('LV')
    expect(p.risk).toBe(10.0)
    expect(p.adp12).toBe('1.12')
  })

  it('RB 26 Jacory Croskey-Merritt (WAS) survives the wrapped line', () => {
    const p = find('RB', 26)
    expect(p.name).toBe('Jacory Croskey-Merritt')
    expect(p.team).toBe('WAS')
    expect(p.adp12).toBe('8.11')
    expect(p.risk).toBe(6.3)
    expect(p.upside).toBe(5.9)
  })

  it('carries the WR list past rank 100 onto page 2', () => {
    const wrs = byPosition('WR')
    expect(wrs.length).toBeGreaterThan(100)
    // Rank >= 100 arrives merged into a single text run with the name.
    expect(find('WR', 100).name).toBe('Elic Ayomanor')
    expect(find('WR', 100).team).toBe('TEN')
  })

  it('reads three-digit ranks and out-of-range ADP rounds', () => {
    const p = find('WR', 129)
    expect(p.name).toBe('Chris Brazzell II')
    expect(p.adp12).toBe('34.04')
    expect(p.adpOverall).toBe(400)
  })

  it('keeps a "-" ADP null', () => {
    const p = find('QB', 34)
    expect(p.name).toBe('Kirk Cousins')
    expect(p.adp12).toBeNull()
    expect(p.adpOverall).toBeNull()
  })

  it('handles apostrophes, hyphens, initials, suffixes and accents', () => {
    const names = sheet.players.map((p) => p.name)
    expect(names).toContain("Ja'Kobi Lane")
    expect(names).toContain('J.K. Dobbins')
    expect(names).toContain('T.J. Hockenson')
    expect(names).toContain('Harold Fannin Jr.')
    expect(names).toContain('Kyle Pitts Sr.')
    expect(names).toContain('Ollie Gordon II')
    expect(names).toContain('Calvin Austin III')
    expect(names).toContain('Audric Estimé')
    expect(names).toContain('Eddy Piñeiro')
  })

  it('marks free agents with the FA code', () => {
    expect(find('RB', 78).name).toBe('Jerome Ford')
    expect(find('RB', 78).team).toBe('FA')
  })
})

describe('tiers', () => {
  it('matches the sheet tier breaks for QB', () => {
    expect(find('QB', 1).tier).toBe(1)
    expect(find('QB', 2).tier).toBe(2)
    expect(find('QB', 3).tier).toBe(2)
    expect(find('QB', 4).tier).toBe(3)
  })

  it('matches the sheet tier breaks for TE', () => {
    expect(find('TE', 1).tier).toBe(1)
    expect(find('TE', 2).tier).toBe(1)
    expect(find('TE', 3).tier).toBe(2)
    expect(find('TE', 5).tier).toBe(3)
    expect(find('TE', 9).tier).toBe(4)
  })

  it('carries the RB tier across the page break and picks up TIER 11', () => {
    expect(find('RB', 66).tier).toBe(10) // page 2, before any tier bar
    expect(find('RB', 72).tier).toBe(10)
    expect(find('RB', 73).tier).toBe(11)
  })

  it('carries the WR tier across the page break and picks up TIER 10', () => {
    expect(find('WR', 68).tier).toBe(9)
    expect(find('WR', 105).tier).toBe(9)
    expect(find('WR', 106).tier).toBe(10)
  })

  it('numbers tiers from 1 and ascending within each position', () => {
    for (const position of ['QB', 'RB', 'WR', 'TE'] as Position[]) {
      const tiers = byPosition(position).map((p) => p.tier!)
      expect(tiers[0], position).toBe(1)
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i] - tiers[i - 1], `${position} rank ${i + 1}`).toBeGreaterThanOrEqual(0)
        expect(tiers[i] - tiers[i - 1], `${position} rank ${i + 1}`).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('defenses and kickers', () => {
  it('has 32 defenses with no ADP fields', () => {
    const dsts = byPosition('DST')
    expect(dsts).toHaveLength(32)
    for (const d of dsts) {
      expect(d.adp12).toBeNull()
      expect(d.adpOverall).toBeNull()
      expect(d.risk).toBeNull()
      expect(d.upside).toBeNull()
      expect(d.tier).toBeNull()
    }
    expect(dsts[0].name).toBe('Houston Texans')
    expect(dsts[0].team).toBe('HOU')
    expect(dsts[31].name).toBe('Arizona Cardinals')
  })

  it('parses kickers as a plain list with teams', () => {
    const ks = byPosition('K')
    expect(ks.length).toBeGreaterThanOrEqual(32)
    expect(ks[0].name).toBe('Brandon Aubrey')
    expect(ks[0].team).toBe('DAL')
    for (const k of ks) {
      expect(k.tier).toBeNull()
      expect(k.risk).toBeNull()
    }
  })
})

describe('overall shape', () => {
  it('parses the full board', () => {
    expect(sheet.players.length).toBeGreaterThan(350)
    const ids = new Set(sheet.players.map((p) => p.id))
    expect(ids.size).toBe(sheet.players.length)
  })
})

describe('badges', () => {
  it('recovers the seven legend glyphs from the painted images', () => {
    const legend = buildBadgeLegend(pages)
    expect(legend.size).toBe(7)
    expect([...legend.values()].sort()).toEqual(
      ['breakout', 'bust', 'injury', 'myGuy', 'rookie', 'sleeper', 'value'],
    )
  })

  it('places every non-legend glyph on a player', () => {
    // Each page repeats the 7-glyph legend; everything else belongs to a row.
    const glyphs = pages.reduce((n, page) => n + page.images.length, 0)
    const legendGlyphs = 7 * pages.length
    expect(sheet.badgesFound).toBe(glyphs - legendGlyphs)
  })

  it('tags a meaningful number of players', () => {
    const tagged = sheet.players.filter((p) => p.badges.length > 0)
    expect(tagged.length).toBeGreaterThan(50)
    expect(sheet.badgesFound).toBe(sheet.players.reduce((n, p) => n + p.badges.length, 0))
  })

  it('reads known badge rows off the sheet', () => {
    expect(find('QB', 9).name).toBe('Caleb Williams')
    expect(find('QB', 9).badges).toEqual(['myGuy'])
    expect(find('QB', 32).badges).toEqual(['rookie'])
    expect(find('RB', 12).name).toBe('Ashton Jeanty')
    expect(find('RB', 12).badges).toEqual(['injury'])
  })

  it('keeps multiple badges in the order they are printed', () => {
    expect(find('RB', 7).name).toBe('Kenneth Walker')
    expect(find('RB', 7).badges).toEqual(['myGuy', 'breakout'])
    expect(find('RB', 15).name).toBe('Jeremiyah Love')
    expect(find('RB', 15).badges).toEqual(['rookie', 'bust', 'injury'])
  })

  it('never invents a badge outside the legend', () => {
    for (const p of sheet.players) {
      for (const badge of p.badges) {
        expect(BADGES, `${p.name}`).toContain(badge)
      }
      expect(new Set(p.badges).size, `${p.name} has duplicates`).toBe(p.badges.length)
    }
  })

  it('leaves defenses and kickers unbadged', () => {
    for (const p of sheet.players) {
      if (p.position === 'DST' || p.position === 'K') expect(p.badges, p.name).toEqual([])
    }
  })
})
