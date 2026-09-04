import { BADGES, type Badge, type Player, type Position, POSITIONS } from '../../types'
import { adp12ToOverall } from '../adp'
import { validate } from './parse'
import type { ParsedSheet } from './types'

const HEADER_ALIASES: Record<string, string> = {
  pos: 'position',
  position: 'position',
  rank: 'rank',
  rk: 'rank',
  tier: 'tier',
  name: 'name',
  player: 'name',
  team: 'team',
  tm: 'team',
  adp12: 'adp12',
  adp: 'adp12',
  risk: 'risk',
  upside: 'upside',
  up: 'upside',
  badges: 'badges',
}

/** Split a line on commas or tabs, honouring double quotes. */
export function splitDelimited(line: string, delimiter: string): string[] {
  const out: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === delimiter) {
      out.push(field)
      field = ''
    } else field += ch
  }
  out.push(field)
  return out.map((f) => f.trim())
}

/**
 * Section 4.4: accept a pasted CSV/TSV as an alternate import path
 * (`position, rank, tier, name, team, adp12, risk, upside, badges`).
 */
export function parseCsv(text: string): ParsedSheet {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) {
    return {
      sheetTitle: 'Pasted rankings',
      sheetDate: null,
      players: [],
      issues: [{ level: 'error', message: 'Nothing to import.' }],
      unparsed: [],
      badgesFound: 0,
    }
  }

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const rawHeader = splitDelimited(lines[0], delimiter).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
  const header = rawHeader.map((h) => HEADER_ALIASES[h] ?? h)
  const hasHeader = header.includes('position') && header.includes('name')
  const columns = hasHeader
    ? header
    : ['position', 'rank', 'tier', 'name', 'team', 'adp12', 'risk', 'upside', 'badges']

  const players: Player[] = []
  const unparsed: string[] = []
  const seen = new Set<string>()

  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitDelimited(line, delimiter)
    const get = (key: string): string => {
      const idx = columns.indexOf(key)
      return idx >= 0 ? (cells[idx] ?? '') : ''
    }

    const position = get('position').toUpperCase().replace(/^DEF$/, 'DST') as Position
    const rank = Number(get('rank'))
    const name = get('name')
    if (!POSITIONS.includes(position) || !Number.isInteger(rank) || rank < 1 || !name) {
      unparsed.push(line)
      continue
    }
    const id = `${position}-${rank}`
    if (seen.has(id)) {
      unparsed.push(line)
      continue
    }
    seen.add(id)

    const isRail = position === 'DST' || position === 'K'
    const adpRaw = get('adp12')
    const adp12 = !adpRaw || adpRaw === '-' || isRail ? null : adpRaw
    const num = (v: string): number | null => {
      if (isRail || !v || v === '-') return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const tierRaw = get('tier')
    const badges = get('badges')
      .split(/[|;/]+/)
      .map((b) => b.trim())
      .filter((b): b is Badge => (BADGES as readonly string[]).includes(b))

    players.push({
      id,
      position,
      rank,
      tier: isRail || !tierRaw ? null : Number(tierRaw.replace(/\D/g, '')) || null,
      name,
      team: get('team').toUpperCase() || '',
      adp12,
      adpOverall: adp12ToOverall(adp12),
      risk: num(get('risk')),
      upside: num(get('upside')),
      badges,
      status: 'available',
      draftedAtPick: null,
    })
  }

  players.sort(
    (a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || a.rank - b.rank,
  )
  return {
    sheetTitle: 'Pasted rankings',
    sheetDate: null,
    players,
    issues: validate(players, { requireAllPositions: false }),
    unparsed,
    badgesFound: players.reduce((n, p) => n + p.badges.length, 0),
  }
}
