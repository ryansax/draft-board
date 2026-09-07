import { FLEX_POSITIONS, type Player, type Position, type RosterConfig, type Session } from '../types'
import { draftRounds, isMarked } from './draft'
import { managerRosters } from './insights'
import { slotAtMoment } from './trades'

/**
 * What is actually going to come off the board before my next turn.
 *
 * The old answer was "these managers have a starting hole here", which is not the
 * same question. Everybody has a hole at defence in round four and nobody takes a
 * defence in round four. Need says what a roster is missing; it says nothing about
 * when a roster goes and gets it.
 *
 * ADP already carries that timing — a defence sits at pick 140 because that is
 * where defences go — so this walks the intervening picks and, for each one, takes
 * the player that manager would most plausibly take: best value on the board,
 * nudged by the holes he still has to fill and pushed away from positions he has
 * already stacked. Positions fall out of the simulation rather than being asserted.
 */

/** How many picks early a manager will reach to fill a starting hole. */
const STARTER_HOLE = 10
/** The same for a flex spot, which is easier to fill later. */
const FLEX_HOLE = 5
/** Per player beyond a sensible number at one position. */
const SATURATION = 12
/** A player the market has no read on is not the one being taken here. */
const NO_MARKET = -500
/**
 * Past this, being further overdue stops making a player more likely.
 *
 * Without it, a back with an early market slot still sitting there in the last
 * round outscores everything for the rest of the draft, and no defence is ever
 * taken. Being forty picks overdue and being eighty picks overdue both just mean
 * the room has passed on him.
 */
const VALUE_CAP = 40
/** A hole that must be filled with the picks remaining beats any value on offer. */
const MUST_FILL = 1000

export interface PositionForecast {
  position: Position
  /** How many of the coming picks the simulation spends here. */
  expected: number
  /** How many of the managers picking before me still have a hole at it. */
  needing: number
  /** The specific players it expects to be gone, soonest first. */
  players: Player[]
}

export interface RunForecast {
  /** Picks between now and my next turn. */
  picks: number
  positions: PositionForecast[]
  /** Everyone expected to go, in the order the simulation takes them. */
  gone: Player[]
}

/** Starting slots a roster has not filled, kept per position plus the flex. */
function holesFor(roster: Player[], config: RosterConfig) {
  const own = new Map<Position, number>([
    ['QB', config.QB],
    ['RB', config.RB],
    ['WR', config.WR],
    ['TE', config.TE],
    ['DST', config.DST],
    ['K', config.K],
  ])
  let flex = config.FLEX
  for (const player of roster) {
    const left = own.get(player.position) ?? 0
    if (left > 0) {
      own.set(player.position, left - 1)
      continue
    }
    if (flex > 0 && FLEX_POSITIONS.includes(player.position)) flex -= 1
  }
  return { own, flex }
}

/**
 * How plausible this player is as that manager's next pick, in ADP-equivalent
 * picks. `slack` is how many spare picks he has beyond the holes he must still
 * fill: when it runs out, filling one stops being a preference and becomes the
 * whole decision, which is why defences and kickers go when they go.
 */
function scoreFor(
  player: Player,
  roster: Player[],
  config: RosterConfig,
  moment: number,
  holes: ReturnType<typeof holesFor>,
  slack: number,
): number {
  if (player.adpOverall === null) return NO_MARKET

  // Value: how far past his market slot the draft already is, to a point.
  let score = Math.min(moment - player.adpOverall, VALUE_CAP)

  const fillsOwn = (holes.own.get(player.position) ?? 0) > 0
  const fillsFlex = holes.flex > 0 && FLEX_POSITIONS.includes(player.position)
  if (fillsOwn) score += slack <= 0 ? MUST_FILL : STARTER_HOLE + STARTER_HOLE / Math.max(1, slack)
  else if (fillsFlex) score += slack <= 0 ? MUST_FILL / 2 : FLEX_HOLE

  // Nobody takes a fifth running back while a starting spot is open.
  const held = roster.filter((p) => p.position === player.position).length
  const comfortable = (config[player.position as keyof RosterConfig] as number) + 1
  if (held >= comfortable) score -= (held - comfortable + 1) * SATURATION

  return score
}

/** Starting spots still open across the whole roster, flex included. */
function holeCount(holes: ReturnType<typeof holesFor>): number {
  let total = holes.flex
  for (const left of holes.own.values()) total += left
  return total
}

/**
 * Play the draft forward from `fromMoment` up to (not including) `toMoment`.
 *
 * Greedy and deterministic: each manager takes the best-scoring player left. It is
 * a forecast, not a prophecy — the value is in seeing that four of the next six
 * picks look like running backs, not in the individual names.
 */
export function forecastRun(
  session: Session,
  fromMoment: number,
  toMoment: number | null,
): RunForecast {
  const empty: RunForecast = { picks: 0, positions: [], gone: [] }
  if (toMoment === null || toMoment <= fromMoment) return empty

  const pool = session.players.filter((p) => !isMarked(p))
  if (pool.length === 0) return empty

  // Rosters are mutated as the simulation runs, so a manager picking twice in the
  // window does not take two of the same thing.
  const rosters = new Map<number, Player[]>()
  for (const [slot, players] of managerRosters(session)) rosters.set(slot, [...players])

  const taken = new Set<string>()
  const gone: Player[] = []
  const needingBefore = new Map<Position, Set<number>>()

  for (let moment = fromMoment; moment < toMoment; moment++) {
    const slot = slotAtMoment(moment, session)
    if (slot === session.draftSlot) continue
    const roster = rosters.get(slot) ?? []

    // Record who was short of what before they picked, for the explanation.
    const holes = holesFor(roster, session.rosterConfig)
    const { own, flex } = holes
    for (const [position, left] of own) {
      if (left > 0) {
        const seen = needingBefore.get(position) ?? new Set<number>()
        seen.add(slot)
        needingBefore.set(position, seen)
      }
    }
    if (flex > 0) {
      for (const position of FLEX_POSITIONS) {
        const seen = needingBefore.get(position) ?? new Set<number>()
        seen.add(slot)
        needingBefore.set(position, seen)
      }
    }

    // Every manager picks once a round, so what is left to him is what is left
    // of the draft. Spare picks beyond his holes is his slack.
    const picksLeft = Math.max(1, draftRounds(session.rosterConfig) - roster.length)
    const slack = picksLeft - holeCount(holes)

    let best: Player | null = null
    let bestScore = -Infinity
    for (const player of pool) {
      if (taken.has(player.id)) continue
      const score = scoreFor(player, roster, session.rosterConfig, moment, holes, slack)
      if (score > bestScore) {
        bestScore = score
        best = player
      }
    }
    if (!best) break

    taken.add(best.id)
    gone.push(best)
    roster.push(best)
    rosters.set(slot, roster)
  }

  const byPosition = new Map<Position, Player[]>()
  for (const player of gone) {
    byPosition.set(player.position, [...(byPosition.get(player.position) ?? []), player])
  }

  const positions: PositionForecast[] = [...byPosition.entries()]
    .map(([position, players]) => ({
      position,
      expected: players.length,
      needing: needingBefore.get(position)?.size ?? 0,
      players,
    }))
    .sort((a, b) => b.expected - a.expected || b.needing - a.needing)

  return { picks: toMoment - fromMoment, positions, gone }
}

/**
 * Whether a player I am eyeing is expected to survive until my turn.
 *
 * Reads off the same simulation, so the panel and the player rows cannot disagree
 * about who is going.
 */
export function survives(player: Player, forecast: RunForecast): boolean {
  return !forecast.gone.some((p) => p.id === player.id)
}
