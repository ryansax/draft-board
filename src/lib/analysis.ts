import type { Player, Session } from '../types'
import { teamFullName } from './nflTeams'
import { managerRosters, roundForPick, slotForPick, unmetNeeds } from './insights'
import { isMarked, tierKey, tierStates } from './draft'

/**
 * A short analyst's take on a pick, generated after the announcement.
 *
 * Everything the model sees comes from the cheat sheet and the board, and the
 * prompt forbids inventing anything else — it has no access to this season's news
 * and would otherwise happily make some up.
 */

export const VERDICTS = ['Steal', 'Value', 'Solid', 'Fair', 'Reach'] as const
export type Verdict = (typeof VERDICTS)[number]

export interface PickAnalysis {
  verdict: Verdict
  take: string
}

/** The facts handed to the model. Built separately so it can be tested. */
export interface AnalysisContext {
  playerName: string
  position: string
  team: string
  positionRank: number
  tier: number | null
  adpOverall: number | null
  /** Picks between his ADP and where he actually went. Positive means he fell. */
  adpDelta: number | null
  risk: number | null
  upside: number | null
  badges: string[]
  overallPick: number
  round: number
  pickInRound: number
  managerName: string
  /** What this manager had already taken, e.g. ["RB", "RB", "WR"]. */
  managerPositionsSoFar: string[]
  managerStillNeeds: string[]
  /** How much of the player's tier is left after this pick. */
  tierRemaining: number | null
  tierTotal: number | null
  /** Best player still on the board at the same position, by sheet rank. */
  nextBestAtPosition: string | null
}

export function buildAnalysisContext(
  session: Session,
  player: Player,
  overallPick: number,
): AnalysisContext {
  const round = roundForPick(overallPick, session.leagueSize)
  const slot = slotForPick(overallPick, session.leagueSize)
  const roster = managerRosters(session).get(slot) ?? []
  const tiers = tierStates(session.players)
  const tier = player.tier === null ? null : tiers.get(tierKey(player.position, player.tier))

  const nextBest = session.players
    .filter((p) => p.position === player.position && !isMarked(p) && p.id !== player.id)
    .sort((a, b) => a.rank - b.rank)[0]

  return {
    playerName: player.name,
    position: player.position,
    team: teamFullName(player.team),
    positionRank: player.rank,
    tier: player.tier,
    adpOverall: player.adpOverall,
    adpDelta: player.adpOverall === null ? null : overallPick - player.adpOverall,
    risk: player.risk,
    upside: player.upside,
    badges: player.badges,
    overallPick,
    round,
    pickInRound: overallPick - (round - 1) * session.leagueSize,
    managerName: session.managers[slot - 1] ?? `Team ${slot}`,
    managerPositionsSoFar: roster.filter((p) => p.id !== player.id).map((p) => p.position),
    managerStillNeeds: [...new Set(unmetNeeds(roster, session.rosterConfig))],
    tierRemaining: tier?.remaining ?? null,
    tierTotal: tier?.total ?? null,
    nextBestAtPosition: nextBest ? `${nextBest.name} (${nextBest.position}${nextBest.rank})` : null,
  }
}

export const ANALYSIS_SYSTEM_PROMPT = `You are the analyst on a fantasy football draft broadcast. After each pick you give one short, punchy reaction for a room of friends watching a big screen.

Rules:
- Two sentences at most. Aim for one.
- Base every claim ONLY on the numbers you are given. You do not have this season's news, stats, depth charts or injury reports, and you must not imply that you do. Never invent a statistic, a injury, a coaching change or a storyline.
- The numbers come from a Fantasy Footballers cheat sheet: a rank within the position, a tier, an ADP as an overall pick number, and risk and upside each scored 1-10.
- "adpDelta" is how many picks past his ADP he went. Positive means he lasted longer than the market expected; negative means the manager reached.
- Speak plainly, like a person, not a spreadsheet. Do not list the numbers back; use them to make a point.
- No emoji, no hashtags, no direct address to the manager.

Pick a verdict that matches the value: Steal, Value, Solid, Fair or Reach.`

/** The user-turn payload: just the facts, as JSON. */
export function buildAnalysisPrompt(context: AnalysisContext): string {
  return `Here is the pick:\n\n${JSON.stringify(context, null, 2)}`
}

/**
 * Guard the model's answer before it goes on a screen in front of people: trim
 * it, cap the length, and reject a verdict outside the set.
 */
export function coerceAnalysis(raw: unknown): PickAnalysis | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as { verdict?: unknown; take?: unknown }
  const take = typeof candidate.take === 'string' ? candidate.take.trim() : ''
  if (!take) return null
  const verdict = VERDICTS.includes(candidate.verdict as Verdict)
    ? (candidate.verdict as Verdict)
    : 'Solid'
  return { verdict, take: take.length > 320 ? `${take.slice(0, 317).trimEnd()}…` : take }
}
