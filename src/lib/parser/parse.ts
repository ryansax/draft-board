import type { Badge, Player, Position } from '../../types'
import { adp12ToOverall } from '../adp'
import type { ImageItem, PageItems, ParsedSheet, ParseIssue, TextItem } from './types'

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

/** Section headings on the sheet, mapped to the position they introduce. */
const SECTION_HEADINGS: Record<string, Position> = {
  quarterbacks: 'QB',
  'running backs': 'RB',
  'wide receivers': 'WR',
  'tight ends': 'TE',
  defenses: 'DST',
  kickers: 'K',
}

/** The badge legend at the top of the sheet, mapped to our badge keys. */
const LEGEND_LABELS: Record<string, Badge> = {
  'my guy': 'myGuy',
  sleeper: 'sleeper',
  breakout: 'breakout',
  value: 'value',
  rookie: 'rookie',
  bust: 'bust',
  'injury concerns': 'injury',
  injury: 'injury',
}

/** Badge glyphs are small squares; the sheet logo is neither. */
const MAX_GLYPH_SIZE = 12
const MAX_GLYPH_ASPECT_SKEW = 2
/** A legend label sits just to the right of its glyph. */
const LEGEND_LABEL_MAX_GAP = 40
const LEGEND_LABEL_Y_TOLERANCE = 4
/** A glyph sits on its player's baseline, within about a line height. */
const GLYPH_ROW_Y_TOLERANCE = 3

/** Items on the same text baseline land within this many PDF units of each other. */
const ROW_Y_TOLERANCE = 1.5
/** A row item may start slightly left of its column heading (tier bars are inset +2). */
const COLUMN_LEFT_SLACK = 6
/** Widest a single column's content gets before the next column starts. */
const COLUMN_MAX_WIDTH = 175
/** Row text runs cluster tightly around one font size; headings sit well above it. */
const ROW_HEIGHT_TOLERANCE = 0.3
const HEADING_HEIGHT_MARGIN = 1.5

// ---------------------------------------------------------------------------
// Row grammar
// ---------------------------------------------------------------------------

const TEAM = '(?:FA|[A-Z]{2,3})'
const ADP = '(?:\\d{1,2}\\.\\d{2}|-)'
const SCORE = '(?:\\d{1,2}\\.\\d)'

/** `{rank} {Name} ({TEAM}) {ADP} {RISK} {UP}` */
const SKILL_ROW = new RegExp(`^(\\d{1,3})\\s+(.+?)\\s+\\((${TEAM})\\)\\s+(${ADP})\\s+(${SCORE})\\s+(${SCORE})$`)
/** Same, but the team wrapped onto the next line. */
const SKILL_ROW_NO_TEAM = new RegExp(`^(\\d{1,3})\\s+(.+?)\\s+(${ADP})\\s+(${SCORE})\\s+(${SCORE})$`)
/** Defenses (`1 Houston Texans`) and kickers (`1 Brandon Aubrey (DAL)`). */
const RAIL_ROW = new RegExp(`^(\\d{1,3})\\s+(.+?)(?:\\s+\\((${TEAM})\\))?$`)
const TIER_ROW = /^TIER\s+(\d+)$/i
const TEAM_ONLY = new RegExp(`^\\((${TEAM})\\)$`)
const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/

const NFL_TEAM_CODES: Record<string, string> = {
  'arizona cardinals': 'ARI', 'atlanta falcons': 'ATL', 'baltimore ravens': 'BAL',
  'buffalo bills': 'BUF', 'carolina panthers': 'CAR', 'chicago bears': 'CHI',
  'cincinnati bengals': 'CIN', 'cleveland browns': 'CLE', 'dallas cowboys': 'DAL',
  'denver broncos': 'DEN', 'detroit lions': 'DET', 'green bay packers': 'GB',
  'houston texans': 'HOU', 'indianapolis colts': 'IND', 'jacksonville jaguars': 'JAX',
  'kansas city chiefs': 'KC', 'las vegas raiders': 'LV', 'los angeles chargers': 'LAC',
  'los angeles rams': 'LAR', 'miami dolphins': 'MIA', 'minnesota vikings': 'MIN',
  'new england patriots': 'NE', 'new orleans saints': 'NO', 'new york giants': 'NYG',
  'new york jets': 'NYJ', 'philadelphia eagles': 'PHI', 'pittsburgh steelers': 'PIT',
  'san francisco 49ers': 'SF', 'seattle seahawks': 'SEA', 'tampa bay buccaneers': 'TB',
  'tennessee titans': 'TEN', 'washington commanders': 'WAS',
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** The height shared by the great majority of text runs — i.e. the table body. */
function modalHeight(items: TextItem[]): number {
  const counts = new Map<number, number>()
  for (const i of items) {
    const key = Math.round(i.height * 10) / 10
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let best = 0
  let bestCount = -1
  for (const [h, c] of counts) {
    if (c > bestCount) {
      best = h
      bestCount = c
    }
  }
  return best
}

interface Section {
  position: Position
  x: number
  y: number
  page: number
}

/** Group items sharing a text baseline, ordered top to bottom. */
function toRows(items: TextItem[]): TextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: TextItem[][] = []
  let current: TextItem[] = []
  let currentY = Number.NaN
  for (const item of sorted) {
    if (current.length === 0 || Math.abs(item.y - currentY) <= ROW_Y_TOLERANCE) {
      if (current.length === 0) currentY = item.y
      current.push(item)
    } else {
      rows.push(current)
      current = [item]
      currentY = item.y
    }
  }
  if (current.length) rows.push(current)
  return rows.map((r) => r.sort((a, b) => a.x - b.x))
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseSheet(pages: PageItems[]): ParsedSheet {
  const allItems = pages.flatMap((p) => p.items).filter((i) => i.str.trim() !== '')
  const issues: ParseIssue[] = []
  const unparsed: string[] = []

  if (allItems.length === 0) {
    return {
      sheetTitle: 'Cheat sheet',
      sheetDate: null,
      players: [],
      issues: [{ level: 'error', message: 'No text found in the PDF. It may be a scanned image.' }],
      unparsed,
      badgesFound: 0,
    }
  }

  const rowH = modalHeight(allItems)
  const isRowItem = (i: TextItem) => Math.abs(i.height - rowH) <= ROW_HEIGHT_TOLERANCE
  const isHeading = (i: TextItem) => i.height >= rowH + HEADING_HEIGHT_MARGIN

  // --- Header: title and date -------------------------------------------------
  const headings = allItems.filter(isHeading)
  const titleParts = headings
    .filter((i) => !SECTION_HEADINGS[i.str.trim().toLowerCase()] && !DATE_RE.test(i.str))
    .sort((a, b) => b.y - a.y)
    .map((i) => i.str.trim())
  const sheetTitle = [...new Set(titleParts)].join(' ').trim() || 'Cheat sheet'

  let sheetDate: string | null = null
  for (const item of allItems) {
    const m = DATE_RE.exec(item.str)
    if (m) {
      const [, mm, dd, yyyy] = m
      sheetDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
      break
    }
  }

  // --- Columns: derived from the section headings on the first page -----------
  const sections: Section[] = []
  for (const page of pages) {
    for (const item of page.items) {
      if (!isHeading(item)) continue
      const position = SECTION_HEADINGS[item.str.trim().toLowerCase()]
      if (!position) continue
      sections.push({ position, x: item.x, y: item.y, page: page.pageNumber })
    }
  }
  if (sections.length === 0) {
    issues.push({
      level: 'error',
      message: 'No position headings (Quarterbacks, Running Backs, ...) found — the sheet layout may have changed.',
    })
    return { sheetTitle, sheetDate, players: [], issues, unparsed, badgesFound: 0 }
  }

  /** Distinct column x anchors, ascending. Defenses and Kickers share one. */
  const anchors = [...new Set(sections.map((s) => s.x))].sort((a, b) => a - b)

  const columnAt = (x: number): number | null => {
    let found: number | null = null
    for (const a of anchors) {
      if (x >= a - COLUMN_LEFT_SLACK) found = a
      else break
    }
    if (found === null) return null
    return x <= found + COLUMN_MAX_WIDTH ? found : null
  }

  /**
   * Which position owns a row at height `y` in the column anchored at `x` on `page`.
   * Continuation pages carry no headings, so they resume with whichever section was
   * still open at the bottom of the last page that did.
   */
  const sectionAt = (page: number, anchorX: number, y: number): Position | null => {
    const onThisPage = sections
      .filter((s) => s.x === anchorX && s.page === page)
      .sort((a, b) => b.y - a.y)
    if (onThisPage.length > 0) {
      let position: Position | null = null
      for (const s of onThisPage) if (y < s.y) position = s.position
      return position
    }
    const carried = sections
      .filter((s) => s.x === anchorX && s.page < page)
      .sort((a, b) => a.page - b.page || b.y - a.y)
    return carried.length ? carried[carried.length - 1].position : null
  }

  // --- Walk rows, page by page, column by column ------------------------------
  const players: Player[] = []
  /** Where each player's row landed, so badge glyphs can be matched back to it. */
  const placements: Placement[] = []
  const currentTier = new Map<Position, number | null>()
  /** Last player appended per position, for wrapped-row continuation. */
  const lastPlayer = new Map<Position, Player>()

  for (const page of pages) {
    const rowItems = page.items.filter((i) => i.str.trim() !== '' && isRowItem(i))
    const byColumn = new Map<number, TextItem[]>()
    for (const item of rowItems) {
      const anchor = columnAt(item.x)
      if (anchor === null) continue
      if (!byColumn.has(anchor)) byColumn.set(anchor, [])
      byColumn.get(anchor)!.push(item)
    }

    for (const anchor of anchors) {
      const items = byColumn.get(anchor)
      if (!items) continue

      for (const row of toRows(items)) {
        const y = row[0].y
        const text = row.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim()
        if (!text) continue

        const position = sectionAt(page.pageNumber, anchor, y)
        if (!position) {
          unparsed.push(text)
          continue
        }

        // Tier band
        const tierMatch = TIER_ROW.exec(text)
        if (tierMatch) {
          currentTier.set(position, Number(tierMatch[1]))
          continue
        }

        // Wrapped row: a lone team code belongs to the player above it.
        const teamOnly = TEAM_ONLY.exec(text)
        if (teamOnly) {
          const prev = lastPlayer.get(position)
          if (prev && !prev.team) {
            prev.team = teamOnly[1]
            continue
          }
          unparsed.push(text)
          continue
        }

        const isRail = position === 'DST' || position === 'K'
        const player = isRail
          ? parseRailRow(text, position)
          : parseSkillRow(text, position, currentTier.get(position) ?? null)

        if (player) {
          players.push(player)
          placements.push({ player, page: page.pageNumber, anchorX: anchor, y })
          lastPlayer.set(position, player)
          continue
        }

        // Wrapped row: an overflowing name with no rank of its own.
        const prev = lastPlayer.get(position)
        if (prev && !prev.team && !/^\d/.test(text)) {
          const merged = `${prev.name} ${text}`
          const withTeam = new RegExp(`^(.*?)\\s*\\((${TEAM})\\)$`).exec(merged)
          if (withTeam) {
            prev.name = withTeam[1].trim()
            prev.team = withTeam[2]
          } else {
            prev.name = merged.trim()
          }
          continue
        }

        unparsed.push(text)
      }
    }
  }

  const badgesFound = assignBadges(pages, placements, columnAt)

  players.sort(
    (a, b) => positionOrder(a.position) - positionOrder(b.position) || a.rank - b.rank,
  )

  return {
    sheetTitle,
    sheetDate,
    players,
    issues: [...issues, ...validate(players)],
    unparsed,
    badgesFound,
  }
}

// ---------------------------------------------------------------------------
// Badges
//
// The legend glyphs (My Guy, Sleeper, ...) are image XObjects, not text, so they
// are recovered from the painted images rather than the text layer. The sheet's
// own legend supplies the mapping: each legend glyph is identified by the label
// printed beside it, and every other copy of that same bitmap is that badge.
// ---------------------------------------------------------------------------

interface Placement {
  player: Player
  page: number
  anchorX: number
  y: number
}

function isGlyph(image: ImageItem): boolean {
  return (
    image.width > 0 &&
    image.height > 0 &&
    image.width <= MAX_GLYPH_SIZE &&
    image.height <= MAX_GLYPH_SIZE &&
    Math.abs(image.width - image.height) <= MAX_GLYPH_ASPECT_SKEW
  )
}

/** Read the legend on each page to learn which bitmap means which badge. */
export function buildBadgeLegend(pages: PageItems[]): Map<string, Badge> {
  const legend = new Map<string, Badge>()
  for (const page of pages) {
    for (const image of page.images) {
      if (!isGlyph(image)) continue
      let best: { badge: Badge; gap: number } | null = null
      for (const item of page.items) {
        const badge = LEGEND_LABELS[item.str.trim().toLowerCase()]
        if (!badge) continue
        const gap = item.x - image.x
        if (gap < 0 || gap > LEGEND_LABEL_MAX_GAP) continue
        if (Math.abs(item.y - image.y) > LEGEND_LABEL_Y_TOLERANCE) continue
        if (!best || gap < best.gap) best = { badge, gap }
      }
      if (best && !legend.has(image.hash)) legend.set(image.hash, best.badge)
    }
  }
  return legend
}

/**
 * Attach badges to players. Returns how many glyphs were placed.
 */
function assignBadges(
  pages: PageItems[],
  placements: Placement[],
  columnAt: (x: number) => number | null,
): number {
  const legend = buildBadgeLegend(pages)
  if (legend.size === 0) return 0

  const byPageAndColumn = new Map<string, Placement[]>()
  for (const placement of placements) {
    const key = `${placement.page}:${placement.anchorX}`
    if (!byPageAndColumn.has(key)) byPageAndColumn.set(key, [])
    byPageAndColumn.get(key)!.push(placement)
  }

  /** Glyphs are collected per player first, so they can be ordered left to right. */
  const pending = new Map<Player, Array<{ x: number; badge: Badge }>>()

  for (const page of pages) {
    for (const image of page.images) {
      if (!isGlyph(image)) continue
      const badge = legend.get(image.hash)
      if (!badge) continue

      const anchor = columnAt(image.x)
      if (anchor === null) continue
      const candidates = byPageAndColumn.get(`${page.pageNumber}:${anchor}`)
      if (!candidates) continue

      let best: { placement: Placement; distance: number } | null = null
      for (const placement of candidates) {
        const distance = Math.abs(placement.y - image.y)
        if (distance > GLYPH_ROW_Y_TOLERANCE) continue
        if (!best || distance < best.distance) best = { placement, distance }
      }
      if (!best) continue // legend glyphs and stray art sit on no player row

      const list = pending.get(best.placement.player) ?? []
      list.push({ x: image.x, badge })
      pending.set(best.placement.player, list)
    }
  }

  let count = 0
  for (const [player, glyphs] of pending) {
    const ordered = glyphs.sort((a, b) => a.x - b.x).map((g) => g.badge)
    player.badges = [...new Set(ordered)]
    count += player.badges.length
  }
  return count
}

function positionOrder(p: Position): number {
  return ['QB', 'RB', 'WR', 'TE', 'DST', 'K'].indexOf(p)
}

function parseSkillRow(text: string, position: Position, tier: number | null): Player | null {
  let rank: number
  let name: string
  let team: string
  let adp12: string | null
  let risk: number
  let upside: number

  const full = SKILL_ROW.exec(text)
  if (full) {
    rank = Number(full[1])
    name = full[2].trim()
    team = full[3]
    adp12 = full[4] === '-' ? null : full[4]
    risk = Number(full[5])
    upside = Number(full[6])
  } else {
    const noTeam = SKILL_ROW_NO_TEAM.exec(text)
    if (!noTeam) return null
    rank = Number(noTeam[1])
    name = noTeam[2].trim()
    team = '' // filled in by the wrapped-row continuation
    adp12 = noTeam[3] === '-' ? null : noTeam[3]
    risk = Number(noTeam[4])
    upside = Number(noTeam[5])
  }

  return {
    id: `${position}-${rank}`,
    position,
    rank,
    tier,
    name,
    team,
    adp12,
    adpOverall: adp12ToOverall(adp12),
    risk,
    upside,
    badges: [],
    status: 'available',
    draftedAtPick: null,
  }
}

function parseRailRow(text: string, position: Position): Player | null {
  const m = RAIL_ROW.exec(text)
  if (!m) return null
  const rank = Number(m[1])
  const name = m[2].trim()
  const team = m[3] ?? NFL_TEAM_CODES[name.toLowerCase()] ?? ''
  return {
    id: `${position}-${rank}`,
    position,
    rank,
    tier: null,
    name,
    team,
    adp12: null,
    adpOverall: null,
    risk: null,
    upside: null,
    badges: [],
    status: 'available',
    draftedAtPick: null,
  }
}

// ---------------------------------------------------------------------------
// Validation (section 4.1) — never hardcodes player counts.
// ---------------------------------------------------------------------------

export interface ValidateOptions {
  /** When false, an absent position is a warning rather than a blocking error. */
  requireAllPositions?: boolean
}

export function validate(players: Player[], options: ValidateOptions = {}): ParseIssue[] {
  const { requireAllPositions = true } = options
  const issues: ParseIssue[] = []
  const byPosition = new Map<Position, Player[]>()
  for (const p of players) {
    if (!byPosition.has(p.position)) byPosition.set(p.position, [])
    byPosition.get(p.position)!.push(p)
  }

  for (const position of ['QB', 'RB', 'WR', 'TE', 'DST', 'K'] as Position[]) {
    const list = (byPosition.get(position) ?? []).slice().sort((a, b) => a.rank - b.rank)
    if (list.length === 0) {
      issues.push({
        level: requireAllPositions ? 'error' : 'warning',
        message: `No ${position} players were parsed.`,
        position,
      })
      continue
    }
    // Ranks must be contiguous and ascending from 1.
    for (let i = 0; i < list.length; i++) {
      if (list[i].rank !== i + 1) {
        issues.push({
          level: 'error',
          message: `${position} ranks are not contiguous: expected ${i + 1}, found ${list[i].rank}.`,
          position,
          rank: list[i].rank,
          playerId: list[i].id,
        })
        break
      }
    }
    for (const p of list) {
      if (!p.name) {
        issues.push({ level: 'error', message: `${position} ${p.rank} has no name.`, position, rank: p.rank, playerId: p.id })
      }
      if (!p.team) {
        issues.push({
          level: 'error',
          message: `${p.name || `${position} ${p.rank}`} has no team — the row may have wrapped.`,
          position,
          rank: p.rank,
          playerId: p.id,
        })
      }
      if (p.adp12 !== null && adp12ToOverall(p.adp12) === null) {
        issues.push({ level: 'error', message: `${p.name} has an invalid ADP "${p.adp12}".`, position, rank: p.rank, playerId: p.id })
      }
      for (const [label, value] of [['risk', p.risk], ['upside', p.upside]] as const) {
        if (value === null) continue
        if (!(value >= 1 && value <= 10)) {
          issues.push({
            level: 'error',
            message: `${p.name} has ${label} ${value}, outside 1.0-10.0.`,
            position,
            rank: p.rank,
            playerId: p.id,
          })
        }
      }
      if (position !== 'DST' && position !== 'K' && p.tier === null) {
        issues.push({ level: 'warning', message: `${p.name} has no tier.`, position, rank: p.rank, playerId: p.id })
      }
    }
  }
  return issues
}
