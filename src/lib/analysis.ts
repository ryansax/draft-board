import type { Player, Session } from '../types'
import { teamFullName } from './nflTeams'
import { managerRosters, roundForPick, slotForPick, unmetNeeds } from './insights'

/**
 * A short analyst's take on a pick, generated after the announcement.
 *
 * This goes on the room display, so nothing private goes into it. The owner's
 * cheat sheet — its ranks, tiers, risk and upside scores, and the badges marking
 * his guys — is his draft prep and stays out of the payload entirely. What is
 * sent is either public (the player, his club, ADP) or already on the board in
 * front of everyone (who picked, when, and what they have taken so far).
 */

export const VERDICTS = ['Steal', 'Value', 'Solid', 'Fair', 'Reach'] as const
export type Verdict = (typeof VERDICTS)[number]

export interface PickAnalysis {
  verdict: Verdict
  take: string
}

/**
 * The facts handed to the model. Built separately so it can be tested — and so a
 * test can assert that nothing from the cheat sheet leaks into it.
 */
export interface AnalysisContext {
  playerName: string
  position: string
  /** The club he plays for, spelled out. */
  team: string
  /** Market consensus, not the owner's opinion: an overall pick number. */
  adpOverall: number | null
  /** Picks between ADP and where he actually went. Positive means he fell. */
  adpDelta: number | null
  overallPick: number
  round: number
  pickInRound: number
  managerName: string
  /** Already visible on the board to everyone in the room. */
  managerPositionsSoFar: string[]
  managerStillNeeds: string[]
}

export function buildAnalysisContext(
  session: Session,
  player: Player,
  overallPick: number,
): AnalysisContext {
  const round = roundForPick(overallPick, session.leagueSize)
  const slot = slotForPick(overallPick, session.leagueSize)
  const roster = managerRosters(session).get(slot) ?? []

  return {
    playerName: player.name,
    position: player.position,
    team: teamFullName(player.team),
    adpOverall: player.adpOverall,
    adpDelta: player.adpOverall === null ? null : overallPick - player.adpOverall,
    overallPick,
    round,
    pickInRound: overallPick - (round - 1) * session.leagueSize,
    managerName: session.managers[slot - 1] ?? `Team ${slot}`,
    managerPositionsSoFar: roster.filter((p) => p.id !== player.id).map((p) => p.position),
    managerStillNeeds: [...new Set(unmetNeeds(roster, session.rosterConfig))],
  }
}

export const ANALYSIS_SYSTEM_PROMPT = `You are the colour commentator on a fantasy football draft broadcast, talking to a room of friends who have been in this league for years. After each pick you give one short reaction, out loud.

Length: two sentences at most. Aim for one. This is heard, not read, so make it land.

What you are given:
- The player, his position and his NFL club.
- ADP as an overall pick number, and "adpDelta" — how many picks past that ADP he actually went. Positive means he lasted longer than the market expected; negative means the manager reached for him.
- Which manager picked, where in the draft, what they had already taken, and what they still need to start.

What to talk about:
- The value: did he fall, or did someone jump early for him?
- How he fits what that manager has already built. A fourth running back and no quarterback is worth noticing.
- Context about the player and his club — his role, the offence around him, what makes him interesting.

Tone. Mostly play it straight and useful. But roughly one pick in three, have some fun: a pun, a dry aside, a bit of ribbing about a reach or a lopsided roster. Use the overall pick number as your dial — when it divides by three, lean into the joke; otherwise keep it mostly straight. Team names in this league are often silly, and you are welcome to play with them.

Keep the ribbing warm. Tease the pick, not the person: their roster construction, their reach, their team name are all fair game. Never comment on anyone's character, appearance or intelligence, never swear, and never escalate a crude team name — say it if you must, but do not build on it. If a joke would need something you do not actually know, drop the joke and be useful instead.

Hard rules:
- You are working from training data that may be out of date, and you have no access to this season's news, statistics, depth charts or injury reports. Never state a recent development as current fact, never quote a statistic, and never invent an injury, a trade or a coaching change. If your knowledge of his situation might be stale, speak in general terms instead of asserting specifics.
- Never mention a player ranking, a tier, a risk or upside score, or any notion of a "sheet", "board ranking", "my guy" or a personal list. You have not been given any of that and must not imply you have. The only ordering you may reference is ADP.
- Speak plainly, like a person, not a spreadsheet. Do not read the numbers back; use them to make a point.
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
