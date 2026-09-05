import type { Player } from '../types'

/**
 * Player headshots come from Sleeper's public player list, which is free, needs no
 * key, and serves `access-control-allow-origin: *`. The list is ~2.5MB gzipped, so
 * it is fetched at most once a day and cached as a compact index (~0.3MB).
 *
 * Sleeper asks that the player list not be polled more than once a day.
 */
const PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl'
const HEADSHOT_BASE = 'https://sleepercdn.com/content/nfl/players'
const TEAM_LOGO_BASE = 'https://sleepercdn.com/images/team_logos/nfl'

const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000
/** Bump when the shape of a cached entry changes. */
export const HEADSHOT_INDEX_VERSION = 2

const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])

/** One row of the cached index, kept short because it is stored 4000+ times. */
export interface HeadshotEntry {
  /** Sleeper player id, or the team code for a defense. */
  i: string
  /** Normalised full name. Absent for defenses. */
  k?: string
  /** Normalised surname, for the last-resort match. */
  l?: string
  p: string
  t?: string | null
  /** 1 when Sleeper still lists the player as active. */
  a?: number
  /** Display name, needed to name a teammate out loud. */
  n?: string
  /** Completed NFL seasons. 0 is a rookie. */
  y?: number
}

export interface HeadshotIndex {
  version: number
  fetchedAt: number
  entries: HeadshotEntry[]
}

/** Match Sleeper's own `search_full_name`: lowercase, accents and punctuation gone. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
}

/** The sheet prints suffixes that Sleeper often omits (`Ted Hurst III`). */
export function stripSuffix(name: string): string {
  return name.replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/gi, ' ')
}

function surnameOf(name: string): string {
  const parts = stripSuffix(name).trim().split(/\s+/)
  return normalizeName(parts.slice(1).join(' ') || parts[0] || '')
}

export function buildIndex(raw: Record<string, any>): HeadshotEntry[] {
  const entries: HeadshotEntry[] = []
  for (const [id, p] of Object.entries(raw)) {
    const position = p?.position
    if (typeof position !== 'string' || !FANTASY_POSITIONS.has(position)) continue
    if (position === 'DEF') {
      if (p.team) entries.push({ i: id, p: position, t: p.team })
      continue
    }
    const key = p.search_full_name || normalizeName(p.full_name ?? '')
    if (!key) continue
    entries.push({
      i: id,
      k: key,
      l: normalizeName(stripSuffix(p.last_name ?? '')),
      p: position,
      t: p.team ?? null,
      a: p.active === true ? 1 : 0,
      n: typeof p.full_name === 'string' ? p.full_name : undefined,
      y: Number.isFinite(p.years_exp) ? p.years_exp : undefined,
    })
  }
  return entries
}

export type HeadshotLookup = (player: Player) => string | null

/**
 * Resolve players to image URLs. Tiers run strictest first; the surname tier is a
 * last resort and only fires when exactly one active player fits, which is what
 * rescues nicknames like "Hollywood Brown" -> Marquise Brown.
 */
export function createLookup(entries: HeadshotEntry[]): HeadshotLookup {
  const byKeyPosTeam = new Map<string, string>()
  const byKeyPos = new Map<string, string>()
  const byKey = new Map<string, string>()
  const defByTeam = new Map<string, string>()
  const bySurname = new Map<string, string[]>()

  for (const e of entries) {
    if (e.p === 'DEF') {
      if (e.t) defByTeam.set(e.t, e.i)
      continue
    }
    const preferred = e.a === 1
    const put = (map: Map<string, string>, key: string) => {
      if (!map.has(key) || preferred) map.set(key, e.i)
    }
    if (e.k) {
      if (e.t) put(byKeyPosTeam, `${e.k}|${e.p}|${e.t}`)
      put(byKeyPos, `${e.k}|${e.p}`)
      put(byKey, e.k)
    }
    if (e.l && e.t && preferred) {
      const key = `${e.l}|${e.p}|${e.t}`
      bySurname.set(key, [...(bySurname.get(key) ?? []), e.i])
    }
  }

  return (player) => {
    if (player.position === 'DST') {
      const id = defByTeam.get(player.team)
      return id ? teamLogoUrl(id) : player.team ? teamLogoUrl(player.team) : null
    }
    const key = normalizeName(player.name)
    const bare = normalizeName(stripSuffix(player.name))
    const position = player.position
    const candidates = bySurname.get(`${surnameOf(player.name)}|${position}|${player.team}`)
    const id =
      byKeyPosTeam.get(`${key}|${position}|${player.team}`) ??
      byKeyPos.get(`${key}|${position}`) ??
      byKeyPos.get(`${bare}|${position}`) ??
      byKey.get(key) ??
      (candidates && candidates.length === 1 ? candidates[0] : undefined)
    return id ? headshotUrl(id) : null
  }
}

export function headshotUrl(sleeperId: string): string {
  return `${HEADSHOT_BASE}/${sleeperId}.jpg`
}

export function teamLogoUrl(team: string): string {
  return `${TEAM_LOGO_BASE}/${team.toLowerCase()}.png`
}

export function isStale(index: HeadshotIndex | undefined | null): boolean {
  if (!index || index.version !== HEADSHOT_INDEX_VERSION) return true
  return Date.now() - index.fetchedAt > REFRESH_AFTER_MS
}

/** Fetch and index the player list. Throws on network or shape failure. */
export async function fetchIndex(signal?: AbortSignal): Promise<HeadshotIndex> {
  const response = await fetch(PLAYERS_URL, { signal })
  if (!response.ok) throw new Error(`Sleeper player list: HTTP ${response.status}`)
  const raw = (await response.json()) as Record<string, any>
  const entries = buildIndex(raw)
  if (entries.length === 0) throw new Error('Sleeper player list returned nothing usable')
  return { version: HEADSHOT_INDEX_VERSION, fetchedAt: Date.now(), entries }
}
