import { BADGES, type Badge, type Player, type Position, POSITIONS } from '../../types'
import type { ParseIssue } from './types'


export interface AiBadgeRow {
  position: Position
  rank: number
  name: string
  badges: Badge[]
}

export const BADGE_MODEL = 'claude-opus-5'

export const BADGE_PROMPT = `You are reading a Fantasy Footballers "Redraft Rankings" cheat sheet page.

Small coloured glyphs appear immediately after some player names. The legend at the
top of the page maps them:
- heart / "My Guy" -> myGuy
- moon / "Sleeper" -> sleeper
- upward arrow / "Breakout" -> breakout
- tag / "Value" -> value
- star / "Rookie" -> rookie
- crossed circle / "Bust" -> bust
- triangle or cross / "Injury Concerns" -> injury

Return ONLY the players that carry at least one glyph. Ignore players with none.

Respond with strict JSON and nothing else — no prose, no markdown fence:
{"players":[{"position":"QB|RB|WR|TE|DST|K","rank":1,"name":"Josh Allen","badges":["myGuy"]}]}

"rank" is the number printed to the left of the player's name, and ranks restart at 1
in every position column. Read every column on the page, including any continued
lists. If you cannot read a glyph confidently, leave it out.`

/**
 * Section 4.3: send rendered page images to the Anthropic Messages API and ask for
 * the badge glyphs, which do not survive text extraction.
 *
 * Called direct from the browser with the user's own key — personal local use only.
 */
/** Pull the JSON payload out of a model response and validate it into badge rows. */
export function coerceBadgeRows(text: string): AiBadgeRow[] {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  let parsed: any
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  const rows = Array.isArray(parsed) ? parsed : parsed.players
  if (!Array.isArray(rows)) return []

  const out: AiBadgeRow[] = []
  for (const row of rows) {
    const position = String(row?.position ?? '').toUpperCase() as Position
    const rank = Number(row?.rank)
    if (!POSITIONS.includes(position) || !Number.isInteger(rank) || rank < 1) continue
    const badges = (Array.isArray(row?.badges) ? row.badges : [])
      .map((b: unknown) => String(b))
      .filter((b: string): b is Badge => (BADGES as readonly string[]).includes(b))
    if (badges.length === 0) continue
    out.push({ position, rank, name: String(row?.name ?? ''), badges: [...new Set(badges)] as Badge[] })
  }
  return out
}

export interface BadgeMergeResult {
  players: Player[]
  issues: ParseIssue[]
}

/**
 * Merge AI badges onto the deterministic parse. The deterministic parse always wins
 * on numeric fields; a name disagreement is surfaced for review rather than applied.
 */
export function mergeBadges(players: Player[], rows: AiBadgeRow[]): BadgeMergeResult {
  const byKey = new Map(players.map((p) => [`${p.position}-${p.rank}`, p]))
  const issues: ParseIssue[] = []
  const merged = players.map((p) => ({ ...p, badges: [...p.badges] }))
  const mergedByKey = new Map(merged.map((p) => [`${p.position}-${p.rank}`, p]))

  for (const row of rows) {
    const key = `${row.position}-${row.rank}`
    const target = mergedByKey.get(key)
    if (!target) {
      issues.push({
        level: 'warning',
        message: `AI reported badges for ${row.position} ${row.rank} (${row.name}), which is not on the sheet — ignored.`,
        position: row.position,
        rank: row.rank,
      })
      continue
    }
    const original = byKey.get(key)!
    if (row.name && !namesAgree(row.name, original.name)) {
      issues.push({
        level: 'warning',
        message: `AI read ${row.position} ${row.rank} as "${row.name}" but the sheet says "${original.name}". Badges applied — check the row.`,
        position: row.position,
        rank: row.rank,
        playerId: original.id,
      })
    }
    target.badges = [...new Set([...target.badges, ...row.badges])]
  }
  return { players: merged, issues }
}

function namesAgree(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
  return norm(a) === norm(b)
}
