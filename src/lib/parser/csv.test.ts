import { describe, expect, it } from 'vitest'
import { parseCsv, splitDelimited } from './csv'

describe('splitDelimited', () => {
  it('honours quoted fields', () => {
    expect(splitDelimited('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd'])
    expect(splitDelimited('a\t b \tc', '\t')).toEqual(['a', 'b', 'c'])
    expect(splitDelimited('"he said ""hi""",x', ',')).toEqual(['he said "hi"', 'x'])
  })
})

describe('parseCsv', () => {
  const csv = [
    'position,rank,tier,name,team,adp12,risk,upside,badges',
    'QB,1,1,Josh Allen,BUF,2.03,2.6,9.7,myGuy|breakout',
    'RB,1,1,Bijan Robinson,ATL,1.01,3.0,9.5,',
    'DST,1,,Houston Texans,HOU,,,,',
  ].join('\n')

  it('reads a header row', () => {
    const sheet = parseCsv(csv)
    expect(sheet.players).toHaveLength(3)
    const qb = sheet.players[0]
    expect(qb.name).toBe('Josh Allen')
    expect(qb.adpOverall).toBe(15)
    expect(qb.badges).toEqual(['myGuy', 'breakout'])
    expect(sheet.issues.filter((i) => i.level === 'error')).toEqual([])
  })

  it('strips ADP, risk, upside and tier from DST and K', () => {
    const dst = parseCsv(csv).players.find((p) => p.position === 'DST')!
    expect(dst.adp12).toBeNull()
    expect(dst.risk).toBeNull()
    expect(dst.tier).toBeNull()
  })

  it('accepts TSV without a header in the documented column order', () => {
    const sheet = parseCsv('WR\t1\t1\tJa\'Marr Chase\tCIN\t1.02\t3.1\t9.4\t')
    expect(sheet.players[0].name).toBe("Ja'Marr Chase")
    expect(sheet.players[0].adpOverall).toBe(2)
  })

  it('collects rows it cannot read instead of dropping them silently', () => {
    const sheet = parseCsv('position,rank,name\nQB,1,Josh Allen\nnonsense line')
    expect(sheet.unparsed).toEqual(['nonsense line'])
  })

  it('treats a "-" ADP as missing', () => {
    const sheet = parseCsv('position,rank,tier,name,team,adp12\nQB,1,1,Kirk Cousins,LV,-')
    expect(sheet.players[0].adp12).toBeNull()
    expect(sheet.players[0].adpOverall).toBeNull()
  })
})
