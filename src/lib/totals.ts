import { POSITIONS, type Position, type Session } from '../types'
import { managerRosters } from './insights'

/** One team's shape: how many it holds at each position, and how many in all. */
export interface TeamTotal {
  slot: number
  name: string
  counts: Record<Position, number>
  total: number
}

/**
 * Every team counted by position.
 *
 * The board says who went where; this says how many backs a manager has, which
 * otherwise means scrolling sixteen rounds and counting with a finger.
 */
export function teamTotals(session: Session): TeamTotal[] {
  const rosters = managerRosters(session)
  return Array.from({ length: session.leagueSize }, (_, i) => i + 1).map((slot) => {
    const roster = rosters.get(slot) ?? []
    const counts = Object.fromEntries(POSITIONS.map((p) => [p, 0])) as Record<Position, number>
    for (const player of roster) counts[player.position] += 1
    return {
      slot,
      name: session.managers[slot - 1] ?? `Team ${slot}`,
      counts,
      total: roster.length,
    }
  })
}

/** The most anyone holds at each position, for marking who leads. */
export function positionLeaders(totals: TeamTotal[]): Record<Position, number> {
  return Object.fromEntries(
    POSITIONS.map((position) => [position, Math.max(0, ...totals.map((t) => t.counts[position]))]),
  ) as Record<Position, number>
}
