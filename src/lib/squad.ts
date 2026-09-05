import type { Player } from '../types'
import {
  normalizeName,
  stripSuffix,
  type HeadshotEntry,
} from './headshots'

/**
 * Current, checkable facts about a player and the offence around him.
 *
 * The analyst was getting these wrong from memory — putting a running back on a
 * team he left, calling a second-year quarterback a rookie who had not taken a
 * snap. Its training data is a season or more behind and it cannot look anything
 * up, so the facts have to be handed to it. Sleeper's player list is already
 * fetched for headshots, is current, and costs nothing extra.
 *
 * Nothing here comes from the owner's cheat sheet. It is all public roster data.
 */
export interface SquadFacts {
  /** Completed NFL seasons: 0 is a true rookie. Null when Sleeper does not say. */
  seasonsPlayed: number | null
  /** Others at his position on his club right now — who he shares the job with. */
  samePosition: string[]
  /** Who is throwing him the ball. Empty for a quarterback or a defence. */
  quarterbacks: string[]
}

export type SquadLookup = (player: Player) => SquadFacts | null

/** How many teammates are worth naming; past this it is a list, not a take. */
const MAX_TEAMMATES = 4

function surnameOf(name: string): string {
  const parts = stripSuffix(name).trim().split(/\s+/)
  return normalizeName(parts.slice(1).join(' ') || parts[0] || '')
}

/**
 * Index the roster by club so a pick can be answered with his actual current
 * teammates rather than the model's recollection of them.
 */
export function createSquadLookup(entries: HeadshotEntry[]): SquadLookup {
  // Only active players with a club can be someone's current teammate.
  const squads = new Map<string, HeadshotEntry[]>()
  for (const entry of entries) {
    if (entry.p === 'DEF' || entry.a !== 1 || !entry.t || !entry.n) continue
    const squad = squads.get(entry.t)
    if (squad) squad.push(entry)
    else squads.set(entry.t, [entry])
  }

  const findEntry = (player: Player): HeadshotEntry | null => {
    const squad = squads.get(player.team)
    if (!squad) return null
    const key = normalizeName(player.name)
    const bare = normalizeName(stripSuffix(player.name))
    const surname = surnameOf(player.name)
    return (
      squad.find((e) => e.k === key && e.p === player.position) ??
      squad.find((e) => e.k === bare && e.p === player.position) ??
      squad.find((e) => e.l === surname && e.p === player.position) ??
      null
    )
  }

  return (player) => {
    if (player.position === 'DST') return null
    const squad = squads.get(player.team)
    if (!squad) return null
    const self = findEntry(player)

    const named = (list: HeadshotEntry[]) =>
      list
        .filter((e) => e.i !== self?.i)
        .map((e) => e.n as string)
        .slice(0, MAX_TEAMMATES)

    return {
      seasonsPlayed: typeof self?.y === 'number' ? self.y : null,
      samePosition: named(squad.filter((e) => e.p === player.position)),
      quarterbacks: player.position === 'QB' ? [] : named(squad.filter((e) => e.p === 'QB')),
    }
  }
}

/**
 * "a rookie who has not taken a snap", "in his second season". Spelled out so the
 * model reads a fact rather than doing arithmetic on a number.
 */
export function experiencePhrase(seasonsPlayed: number | null): string | null {
  if (seasonsPlayed === null) return null
  if (seasonsPlayed <= 0) return 'a rookie who has not played an NFL season yet'
  if (seasonsPlayed === 1) return 'in his second NFL season, with one season behind him'
  if (seasonsPlayed === 2) return 'in his third NFL season'
  if (seasonsPlayed >= 10) return `a veteran, ${seasonsPlayed} seasons in`
  return `${seasonsPlayed} seasons into his career`
}
