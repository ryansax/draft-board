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

/**
 * How the pick sat against the market, in words rather than picks.
 *
 * The model used to get the exact ADP and the exact gap, and it led with them
 * every time — "taken 107 spots before his ADP" both reads like a spreadsheet and
 * puts a number from the owner's sheet on a shared screen. It cannot quote a
 * figure it was never given.
 */
export type MarketValue =
  | 'no real market for him'
  | 'a long way later than the market usually takes him'
  | 'later than the market usually takes him'
  | 'about where the market takes him'
  | 'earlier than the market usually takes him'
  | 'a long way ahead of where the market usually takes him'

/** Rounds either side of ADP that still counts as "about right". */
const ABOUT_RIGHT_ROUNDS = 0.5
/** Beyond this many rounds it is worth remarking on. */
const NOTABLE_ROUNDS = 1.5

export function marketValueFor(
  adpOverall: number | null,
  overallPick: number,
  leagueSize: number,
): MarketValue {
  if (adpOverall === null) return 'no real market for him'
  // Positive means he lasted longer than the market expected.
  const rounds = (overallPick - adpOverall) / Math.max(1, leagueSize)
  if (rounds >= NOTABLE_ROUNDS) return 'a long way later than the market usually takes him'
  if (rounds >= ABOUT_RIGHT_ROUNDS) return 'later than the market usually takes him'
  if (rounds > -ABOUT_RIGHT_ROUNDS) return 'about where the market takes him'
  if (rounds > -NOTABLE_ROUNDS) return 'earlier than the market usually takes him'
  return 'a long way ahead of where the market usually takes him'
}
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
  /** Where this landed against the market, in words. No figure is sent. */
  marketValue: MarketValue
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
    marketValue: marketValueFor(player.adpOverall, overallPick, session.leagueSize),
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
- "marketValue": roughly where this pick sat against where the market usually takes him, in words. You are deliberately not given ADP as a number, and you must never invent one — no pick counts, no "X spots early", no rankings of any kind.
- Which manager picked, where in the draft, what they had already taken, and what they still need to start.

Vary what you talk about. Do not open with the value every time — it should be your angle on maybe half the picks, and only when it is actually interesting. Other angles, at least as good:
- The player himself: his role, the offence around him, what he is known for, his reputation.
- How he fits what that manager has built. A fourth running back and no quarterback is worth noticing.
- Where the draft is: a run at a position, the last of a good group going, the endgame kicker.

Tone. Mostly play it straight and useful. Roughly one pick in three, have some fun: a pun, a dry aside, a bit of ribbing. Use the overall pick number as your dial — when it divides by three, lean into the joke; otherwise keep it mostly straight.

You may rib the players as well as the managers. A player with a long-standing reputation — durable or not, boom-or-bust, a slow starter, a famous vulture, endlessly hyped — is fair game, as is a silly team name. Keep it to what a fan would say about a player, never anything personal or cruel about them as a human being. Tease the pick and the roster, not the manager as a person: never their character, appearance or intelligence. No swearing, and do not escalate a crude team name — say it if you must, but do not build on it.

Hard rules:
- You are working from training data that may be out of date, and you have no access to this season's news, statistics, depth charts or injury reports. You may refer to a player's long-standing reputation — that he has struggled to stay on the field over his career, say — but never assert a current or recent injury, trade, suspension or coaching change, and never quote a statistic. If you are not sure something still holds, say it as reputation rather than as fact, or pick a different angle.
- Never mention a player ranking, a tier, a risk or upside score, an ADP figure, or any notion of a "sheet", "board ranking", "my guy" or a personal list. You have not been given any of that and must not imply you have.
- Speak plainly, like a person, not a spreadsheet. Do not read the inputs back; use them to make a point.
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
