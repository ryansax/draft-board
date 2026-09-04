import {
  FLEX_POSITIONS,
  SKILL_POSITIONS,
  type Player,
  type Position,
  type RosterConfig,
  type Session,
} from '../types'
import { pickForRound } from './adp'
import { bestAtPosition, draftRounds, isMarked, rosterSlotList, tierKey, tierStates } from './draft'

// ---------------------------------------------------------------------------
// Snake geometry: overall pick <-> (round, slot)
// ---------------------------------------------------------------------------

export function roundForPick(pick: number, leagueSize: number): number {
  return Math.ceil(pick / leagueSize)
}

/** Which draft slot owns an overall pick number, honouring the snake. */
export function slotForPick(pick: number, leagueSize: number): number {
  const round = roundForPick(pick, leagueSize)
  const indexInRound = pick - (round - 1) * leagueSize
  return round % 2 === 1 ? indexInRound : leagueSize - indexInRound + 1
}

/** True when the pick on the clock belongs to my slot. */
export function isMyTurn(currentPick: number, leagueSize: number, draftSlot: number): boolean {
  return slotForPick(currentPick, leagueSize) === draftSlot
}

/**
 * What a plain tap on an available player should mean. On my own pick the player
 * being taken is mine by definition, so the app uses the turn it already knows
 * rather than making me reach for a second control. Holding a modifier (or using
 * the row's secondary button) forces the opposite, for when the counter has drifted.
 */
export function statusForTap(myTurn: boolean, forceOpposite = false): 'mine' | 'drafted' {
  const mine = myTurn !== forceOpposite
  return mine ? 'mine' : 'drafted'
}

// ---------------------------------------------------------------------------
// The draft board grid
// ---------------------------------------------------------------------------

export interface GridCell {
  pick: number
  round: number
  slot: number
  player: Player | null
  isMine: boolean
}

/** Rounds of cells, each round ordered left to right by slot. */
export function buildDraftGrid(session: Session): GridCell[][] {
  const byPick = new Map<number, Player>()
  for (const player of session.players) {
    if (player.draftedAtPick === null) continue
    // If the counter was nudged, two players can claim a pick; first one wins.
    if (!byPick.has(player.draftedAtPick)) byPick.set(player.draftedAtPick, player)
  }

  const rounds = draftRounds(session.rosterConfig)
  const grid: GridCell[][] = []
  for (let round = 1; round <= rounds; round++) {
    const row: GridCell[] = []
    for (let slot = 1; slot <= session.leagueSize; slot++) {
      const pick = pickForRound(round, session.leagueSize, slot)
      row.push({
        pick,
        round,
        slot,
        player: byPick.get(pick) ?? null,
        isMine: slot === session.draftSlot,
      })
    }
    grid.push(row)
  }
  return grid
}

/** Players taken by each slot, keyed by slot number. */
export function managerRosters(session: Session): Map<number, Player[]> {
  const rosters = new Map<number, Player[]>()
  for (let slot = 1; slot <= session.leagueSize; slot++) rosters.set(slot, [])
  for (const player of session.players) {
    if (player.draftedAtPick === null) continue
    const slot = slotForPick(player.draftedAtPick, session.leagueSize)
    rosters.get(slot)?.push(player)
  }
  for (const list of rosters.values()) {
    list.sort((a, b) => (a.draftedAtPick ?? 0) - (b.draftedAtPick ?? 0))
  }
  return rosters
}

/** Starting slots a manager has not filled yet. */
export function unmetNeeds(roster: Player[], config: RosterConfig): Position[] {
  const remaining = new Map<string, number>()
  for (const label of rosterSlotList(config)) {
    if (label === 'BN') continue
    remaining.set(label, (remaining.get(label) ?? 0) + 1)
  }
  for (const player of roster) {
    const own = remaining.get(player.position) ?? 0
    if (own > 0) {
      remaining.set(player.position, own - 1)
      continue
    }
    const flex = remaining.get('FLEX') ?? 0
    if (flex > 0 && FLEX_POSITIONS.includes(player.position)) remaining.set('FLEX', flex - 1)
  }
  const needs: Position[] = []
  for (const [label, count] of remaining) {
    if (count <= 0) continue
    if (label === 'FLEX') {
      for (let i = 0; i < count; i++) needs.push(...FLEX_POSITIONS)
    } else {
      for (let i = 0; i < count; i++) needs.push(label as Position)
    }
  }
  return needs
}

export interface PositionPressure {
  position: Position
  /** How many of the managers picking before me still need this position. */
  managersNeeding: number
  /** Players left at this position that the market rates inside the coming window. */
  likelyGone: number
}

/**
 * What the managers picking between now and my next selection are likely to take.
 * This is the payoff for knowing who sits in which slot.
 */
export function pressureBeforeMyPick(
  session: Session,
  currentPick: number,
  myNextPick: number | null,
): PositionPressure[] {
  if (myNextPick === null || myNextPick <= currentPick) return []
  const rosters = managerRosters(session)
  const counts = new Map<Position, number>()

  for (let pick = currentPick; pick < myNextPick; pick++) {
    const slot = slotForPick(pick, session.leagueSize)
    if (slot === session.draftSlot) continue
    const needs = new Set(unmetNeeds(rosters.get(slot) ?? [], session.rosterConfig))
    for (const position of needs) counts.set(position, (counts.get(position) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([position, managersNeeding]) => ({
      position,
      managersNeeding,
      likelyGone: session.players.filter(
        (p) =>
          p.position === position &&
          !isMarked(p) &&
          p.adpOverall !== null &&
          p.adpOverall < myNextPick,
      ).length,
    }))
    .sort((a, b) => b.managersNeeding - a.managersNeeding || b.likelyGone - a.likelyGone)
}

// ---------------------------------------------------------------------------
// Pick recommendation
// ---------------------------------------------------------------------------

/** Filling an empty starting slot at the player's own position. */
export const NEED_STARTER_BONUS = 30
/** Only eligible for the flex — useful, but less urgent. */
export const NEED_FLEX_BONUS = 14
/** Rounds from the end where DST and K become reasonable. */
export const KICKER_ENDGAME_ROUNDS = 2
/** He almost certainly will not last until my next pick. */
export const URGENCY_GONE_BONUS = 12
export const URGENCY_COINFLIP_BONUS = 5
/** He will still be there next time, so someone else is the better pick now. */
export const CAN_WAIT_PENALTY = 10
/** His tier is nearly gone. */
export const TIER_SCARCE_BONUS = 10
/** Cap on how much raw ADP value can dominate the score. */
export const MAX_VALUE_SCORE = 40

export interface Recommendation {
  player: Player
  score: number
  reasons: string[]
}

/**
 * Rank the available players for my next selection. The score combines market value
 * (ADP against the current pick), whether the player fills a starting hole, how close
 * his tier is to empty, and whether he is likely to survive until my following pick.
 * Every contribution is surfaced as a reason so the number is never a black box.
 */
export function recommendPicks(
  session: Session,
  currentPick: number,
  myNextPick: number | null,
  limit = 5,
): Recommendation[] {
  const mine = session.players.filter((p) => p.status === 'mine')
  const needs = new Set(unmetNeeds(mine, session.rosterConfig))
  const tiers = tierStates(session.players)
  const totalRounds = draftRounds(session.rosterConfig)
  const round = roundForPick(myNextPick ?? currentPick, session.leagueSize)
  const followingPick = nextPickAfter(session, myNextPick ?? currentPick)

  const out: Recommendation[] = []
  const endgame = round > totalRounds - KICKER_ENDGAME_ROUNDS

  for (const player of session.players) {
    if (isMarked(player)) continue
    // A kicker or defense is never the right pick before the endgame, whatever the
    // rest of the maths says, so they are excluded outright rather than scored down.
    const isRail = player.position === 'DST' || player.position === 'K'
    if (isRail && !endgame) continue

    const reasons: string[] = []
    let score = 0

    // Market value relative to where the draft actually is.
    if (player.adpOverall !== null) {
      const delta = (myNextPick ?? currentPick) - player.adpOverall
      const value = Math.max(-MAX_VALUE_SCORE, Math.min(MAX_VALUE_SCORE, delta))
      score += value
      if (delta >= 8) reasons.push(`Falling — ADP #${player.adpOverall}, ${delta} picks past due`)
    } else {
      score -= 15 // no market interest at all
    }

    // Positional need.
    const isSkill = (SKILL_POSITIONS as readonly string[]).includes(player.position)
    if (needs.has(player.position)) {
      const flexOnly = !startingSlotExists(session.rosterConfig, player.position)
      score += flexOnly ? NEED_FLEX_BONUS : NEED_STARTER_BONUS
      reasons.push(flexOnly ? 'Fills your flex' : `Fills an open ${player.position} slot`)
    } else if (isSkill && FLEX_POSITIONS.includes(player.position) && needs.has('RB')) {
      score += 0
    }

    if (isRail) reasons.push(`Endgame ${player.position}`)

    // Will he still be here next time round?
    if (player.adpOverall !== null && followingPick !== null) {
      if (player.adpOverall < followingPick - 4) {
        score += URGENCY_GONE_BONUS
        reasons.push(`Won't last to #${followingPick}, your next turn`)
      } else if (player.adpOverall <= followingPick + 4) {
        score += URGENCY_COINFLIP_BONUS
      } else {
        score -= CAN_WAIT_PENALTY
        reasons.push(`Should still be there at #${followingPick} — you can wait`)
      }
    }

    // Tier scarcity.
    if (player.tier !== null) {
      const tier = tiers.get(tierKey(player.position, player.tier))
      if (tier && tier.remaining <= 2 && tier.remaining < tier.total) {
        score += TIER_SCARCE_BONUS
        reasons.push(
          `Last ${tier.remaining} in ${player.position} tier ${player.tier}`,
        )
      }
    }

    // Small quality tiebreakers from the sheet's own opinion.
    if (player.upside !== null) score += (player.upside - 5) * 1.2
    if (player.risk !== null) score -= (player.risk - 5) * 0.8
    if (player.badges.includes('myGuy')) {
      score += 6
      reasons.push('Your guy on the sheet')
    }
    if (player.badges.includes('bust')) score -= 5
    if (player.badges.includes('injury')) score -= 3

    out.push({ player, score: Math.round(score * 10) / 10, reasons })
  }

  return out.sort((a, b) => b.score - a.score || a.player.rank - b.player.rank).slice(0, limit)
}

function startingSlotExists(config: RosterConfig, position: Position): boolean {
  return (config as unknown as Record<string, number>)[position] > 0
}

/** My selection after `pick`, or null if that was my last. */
export function nextPickAfter(session: Session, pick: number): number | null {
  const rounds = draftRounds(session.rosterConfig)
  for (let round = 1; round <= rounds; round++) {
    const candidate = pickForRound(round, session.leagueSize, session.draftSlot)
    if (candidate > pick) return candidate
  }
  return null
}

/** Best remaining player at each of my open starting slots. */
export function needBoard(session: Session): Array<{ position: Position; player: Player | null }> {
  const mine = session.players.filter((p) => p.status === 'mine')
  const needs = [...new Set(unmetNeeds(mine, session.rosterConfig))]
  return needs.map((position) => ({ position, player: bestAtPosition(session.players, position) }))
}
