import type { Player, Position, RosterConfig, SortMode } from '../types'
import { FLEX_POSITIONS } from '../types'
import { byAdpOverall } from './adp'

/** Tier is treated as running dry at this many players left. */
export const TIER_SCARCITY_THRESHOLD = 2

export function isMarked(p: Player): boolean {
  return p.status !== 'available'
}

/**
 * Section 7.2: every selection is logged, so the counter is derived — plus a
 * manual offset for picks that slipped by unlogged.
 */
export function currentPick(players: Player[], pickOffset: number): number {
  const marked = players.reduce((n, p) => n + (isMarked(p) ? 1 : 0), 0)
  return Math.max(1, marked + 1 + pickOffset)
}

/** Roster spots per config, in the order they should appear in the panel. */
export function rosterSlotList(config: RosterConfig): Array<'QB' | 'RB' | 'WR' | 'TE' | 'FLEX' | 'DST' | 'K' | 'BN'> {
  const order = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BN'] as const
  const slots: Array<(typeof order)[number]> = []
  for (const key of order) {
    for (let i = 0; i < config[key]; i++) slots.push(key)
  }
  return slots
}

export function totalRosterSize(config: RosterConfig): number {
  return Object.values(config).reduce((a, b) => a + b, 0)
}

export interface RosterSlot {
  label: 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX' | 'DST' | 'K' | 'BN'
  player: Player | null
}

/**
 * Greedily seat my picks: dedicated slots first, then FLEX for RB/WR/TE
 * overflow, then the bench.
 */
export function fillRoster(mine: Player[], config: RosterConfig): RosterSlot[] {
  const slots: RosterSlot[] = rosterSlotList(config).map((label) => ({ label, player: null }))
  const ordered = [...mine].sort((a, b) => (a.draftedAtPick ?? 0) - (b.draftedAtPick ?? 0))

  const seat = (player: Player, matches: (slot: RosterSlot) => boolean): boolean => {
    const slot = slots.find((s) => s.player === null && matches(s))
    if (!slot) return false
    slot.player = player
    return true
  }

  for (const player of ordered) {
    if (seat(player, (s) => s.label === (player.position as string))) continue
    if (FLEX_POSITIONS.includes(player.position) && seat(player, (s) => s.label === 'FLEX')) continue
    if (seat(player, (s) => s.label === 'BN')) continue
    slots.push({ label: 'BN', player }) // over-drafted past the configured bench
  }
  return slots
}

/** Starting slots still empty, most valuable first. */
export function openNeeds(slots: RosterSlot[]): string[] {
  return slots.filter((s) => s.player === null && s.label !== 'BN').map((s) => s.label)
}

export interface TierState {
  position: Position
  tier: number
  total: number
  remaining: number
  scarce: boolean
}

export function tierStates(players: Player[]): Map<string, TierState> {
  const map = new Map<string, TierState>()
  for (const p of players) {
    if (p.tier === null) continue
    const key = tierKey(p.position, p.tier)
    let state = map.get(key)
    if (!state) {
      state = { position: p.position, tier: p.tier, total: 0, remaining: 0, scarce: false }
      map.set(key, state)
    }
    state.total++
    if (!isMarked(p)) state.remaining++
  }
  for (const state of map.values()) {
    state.scarce = state.remaining > 0 && state.remaining <= TIER_SCARCITY_THRESHOLD
  }
  return map
}

export function tierKey(position: Position, tier: number): string {
  return `${position}:${tier}`
}

/** Section 7.7: top remaining players across all positions by ADP, null ADP last. */
export function bestAvailable(players: Player[], count = 5, positions?: Position[]): Player[] {
  return players
    .filter((p) => !isMarked(p) && (!positions || positions.includes(p.position)))
    .sort((a, b) => byAdpOverall(a, b) || a.rank - b.rank)
    .slice(0, count)
}

/** Best remaining player at a position, by sheet rank. */
export function bestAtPosition(players: Player[], position: Position): Player | null {
  let best: Player | null = null
  for (const p of players) {
    if (p.position !== position || isMarked(p)) continue
    if (!best || p.rank < best.rank) best = p
  }
  return best
}

/** How many rounds the draft runs, given the roster shape. */
export function draftRounds(config: RosterConfig): number {
  return totalRosterSize(config)
}

export function totalPicks(leagueSize: number, config: RosterConfig): number {
  return leagueSize * draftRounds(config)
}

/**
 * Order a column. Sheet order is the printed ranking; the others re-rank the same
 * players by a single number, with anyone missing that number sent to the bottom
 * rather than to the top by accident.
 */
export function sortPlayers(players: Player[], mode: SortMode): Player[] {
  const sorted = [...players]
  if (mode === 'adp') {
    return sorted.sort((a, b) => byAdpOverall(a, b) || a.rank - b.rank)
  }
  if (mode === 'upside') {
    return sorted.sort((a, b) => {
      // Highest upside first; DST and K carry none, so they sink.
      if (a.upside === null && b.upside === null) return a.rank - b.rank
      if (a.upside === null) return 1
      if (b.upside === null) return -1
      return b.upside - a.upside || a.rank - b.rank
    })
  }
  return sorted.sort((a, b) => a.rank - b.rank)
}

/**
 * Split a printed name into the two lines a draft card shows: given name on top,
 * everything else below. Suffixes stay with the surname, and a defense splits
 * naturally into city and nickname ("Houston" / "Texans").
 */
export function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ['', '']
  if (parts.length === 1) return ['', parts[0]]
  return [parts[0], parts.slice(1).join(' ')]
}

/**
 * Move a highlighted index through a list of `count` items, wrapping at both ends
 * so arrowing past either edge lands somewhere useful rather than sticking.
 */
export function wrapIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0
  const bounded = Math.min(Math.max(current, 0), count - 1)
  return (((bounded + delta) % count) + count) % count
}

/** Type-ahead across every position: prefix hits first, then substring. */
export function searchPlayers(players: Player[], query: string, limit = 8): Player[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: Array<{ player: Player; score: number }> = []
  for (const p of players) {
    const name = p.name.toLowerCase()
    let score = -1
    if (name.startsWith(q)) score = 0
    else if (name.split(/[\s.'-]+/).some((w) => w.startsWith(q))) score = 1
    else if (name.includes(q)) score = 2
    else if (p.team.toLowerCase() === q) score = 3
    if (score < 0) continue
    // Available players and better ranks float up.
    scored.push({ player: p, score: score * 1000 + (isMarked(p) ? 500 : 0) + p.rank })
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((s) => s.player)
}
