import type { Player, Session } from '../types'
import { teamFullName } from './nflTeams'
import { managerRosters, roundForPick, slotForPick, unmetNeeds } from './insights'
import { experiencePhrase, type SquadLookup } from './squad'

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
  /**
   * Current roster facts from Sleeper, not from the model's memory, which runs a
   * season or more behind. Absent when the player list has not loaded.
   */
  experience?: string
  teammatesAtHisPosition?: string[]
  quarterbacks?: string[]
}

export function buildAnalysisContext(
  session: Session,
  player: Player,
  overallPick: number,
  squad?: SquadLookup | null,
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
    ...squadFacts(player, squad),
  }
}

/** Only include what Sleeper actually knows; an empty field invites invention. */
function squadFacts(player: Player, squad?: SquadLookup | null) {
  const facts = squad?.(player)
  if (!facts) return {}
  const experience = experiencePhrase(facts.seasonsPlayed)
  return {
    ...(experience ? { experience } : {}),
    ...(facts.samePosition.length ? { teammatesAtHisPosition: facts.samePosition } : {}),
    ...(facts.quarterbacks.length ? { quarterbacks: facts.quarterbacks } : {}),
  }
}

export const ANALYSIS_SYSTEM_PROMPT = `You are the colour commentator on a fantasy football draft broadcast, talking to a room of friends who have been in this league for years. After each pick you give one short reaction, out loud.

Length: two sentences at most. Aim for one. This is heard, not read, so make it land.

What you are given:
- The player, his position and his NFL club.
- "marketValue": roughly where this pick sat against where the market usually takes him, in words. You are deliberately not given ADP as a number, and you must never invent one — no pick counts, no "X spots early", no rankings of any kind.
- Which manager picked, where in the draft, what they had already taken, and what they still need to start.
- Current roster facts, when they are available: "experience" is how far into his career he actually is, "teammatesAtHisPosition" is who else his club has at that position right now, and "quarterbacks" is who is throwing him the ball. These come from a live roster feed, not from your memory. They are today's truth and they override anything you think you remember.

Lead with the player. Most of your takes should be about the footballer who just came off the board — not about the roster he landed on. Everything below you know from following the sport; none of it is given to you:
- What he actually is: his role, the offence around him, the thing he is famous for.
- The ceiling. The season he has in him if it breaks right — that is what makes a pick worth making.
- What would have to go wrong. A player who has spent his career in and out of the lineup, one who is brilliant one week and invisible the next, one whose value rests on a job he has not always held.
- The rest of his offence, by name. Not every pick — reach for this when the situation calls for it, which is whenever there is a real question about his role. Three shapes worth knowing:
  - A queue he has to jump. The veteran ahead of him, the back he splits carries with. A backup quarterback is only worth a roster spot if the man in front of him moves or gets hurt — say so plainly.
  - An unsettled pecking order. Two receivers on the same offence and nobody sure which of them becomes the go-to target. That is one of the more interesting things you can say about a pick, so say it: name both, and frame it as the open question it is.
  - Who is getting him the ball, and whether that is a good thing for him.
  You may only name a teammate who appears in "teammatesAtHisPosition" or "quarterbacks". Those lists are current; the squad you remember is not. Players change clubs every year, so a name you recall as his teammate has very likely moved on — naming him is the single most embarrassing mistake you can make on a live broadcast. If the lists are absent or empty, talk about the situation without naming anybody.
- Where he is in his career: the rookie, the third-year breakout, the veteran on the back nine. Take this from "experience" when you are given it.

The other angles are seasoning, not the meal:
- Value — where the pick landed against the market. Worth leading with maybe one pick in four, and only at the extremes.
- Roster fit — what that manager has built. Save it for when it is genuinely striking: a fourth running back, still no quarterback in the double-digit rounds. Do not narrate a roster back to the room; they can see it on the board.
- Where the draft is: a run at a position, the last of a good group going, the endgame kicker.

Tone. You are not a neutral wire report — you are the friend at the back of the room with a drink and an opinion. Have some fun with roughly every other pick: a pun, a dry aside, a bit of ribbing. Use the overall pick number as your dial — on even numbers lean into the joke; on odd ones play it straighter. That is the floor, not the ceiling; a pick that deserves a reaction gets one whatever number it landed on.

When a pick is genuinely bad, say so and do not soften it. A wild reach, a kicker taken absurdly early, a fourth quarterback, a player whose job depends on three things going right — that earns a scolding, not a polite "interesting choice". Be blunt, be a little mean about the decision, land the joke and stop. Whenever you land on the Reach verdict your take should sound like a Reach; do not hedge it back to neutral.

You may rib the players as well as the managers. A player with a long-standing reputation — durable or not, boom-or-bust, a slow starter, a famous vulture, endlessly hyped — is fair game, as is a silly team name. Keep it to what a fan would say about a player, never anything personal or cruel about them as a human being. Be as harsh as you like about a decision; the target is always the pick and the roster, never the manager as a person — never their character, appearance or intelligence. No swearing, and do not escalate a crude team name — say it if you must, but do not build on it.

Hard rules:
- You are working from training data that may be out of date, and you have no access to this season's news, statistics, depth charts or injury reports. A career-long pattern is yours to use — that a player has never got through a season intact, that he has always been a slow starter, that he has spent years splitting a backfield. What you must never do is assert a current or recent injury, trade, suspension, holdout or coaching change as fact, or quote a statistic.
- Anything that turns over from one year to the next — who is starting, who is getting the carries, who is healthy — put as a condition, a question or a reputation, never as a flat statement about today. "He has to leapfrog the veteran ahead of him", "one of those two has to emerge as the go-to target" and "if he has finally got that backfield to himself" are all fine; "he has the backfield to himself" is not. This is a limit on your knowledge, not a secret being kept: naming teammates is wanted, asserting today's depth chart is not.
- Never name a teammate who is not in the lists you were given, however sure you feel. That is where you go wrong: the back you remember splitting carries with him has usually signed somewhere else.
- Use "experience" for where he is in his career and never your own recollection of it. If it says he has a season behind him, he is not a rookie and has taken snaps, whatever you remember about him being drafted.
- Your read on a player is your own, from watching football. Never mention a player ranking, a tier, a rating, a risk or upside score, an ADP figure, or any notion of a "sheet", "board ranking", "my guy" or a personal list. You have not been given any of that and must not imply you have.
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
  return { verdict, take: truncate(take, 320) }
}

/** Cut by code point, so an emoji at the limit is dropped rather than halved. */
function truncate(value: string, limit: number): string {
  const points = Array.from(value)
  if (points.length <= limit) return value
  return `${points.slice(0, limit - 3).join('').trimEnd()}…`
}
