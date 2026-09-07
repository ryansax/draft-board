import type { Session } from '../types'
import { slotForPick } from './insights'
import { pickForRound } from './adp'
import { draftRounds } from './draft'

/**
 * Picks traded during a live draft.
 *
 * Two numbers matter and they are normally the same, which is why the rest of the
 * app can get away with one:
 *
 * - a **moment** is when a selection happens: the first, second, third player to
 *   come off the board. It is what the clock counts.
 * - a **cell** is where the card lands on the grid: round and column. A column is
 *   a manager's roster, so a cell belongs to a manager permanently.
 *
 * Trading picks swaps *when* two managers choose without moving either of them out
 * of their own column. In a ten-team league where I have cell 61 and the manager in
 * slot six has cell 66, trading our next picks means he chooses at moment 61 — and
 * his card lands in cell 66, his own column — while I choose at moment 66 and my
 * card lands in cell 61.
 *
 * A trade is therefore recorded as the pair of cells whose turns were exchanged,
 * and the moment-to-cell mapping is the composition of those swaps.
 */
export interface PickTrade {
  /** The two cells whose turns were exchanged. Order is not significant. */
  a: number
  b: number
  /**
   * Which agreement this swap belongs to, numbered from 1 in the order they were
   * struck. One handshake across two picks each is four cells sharing a number,
   * which is what the badges on the board count. Absent on swaps recorded before
   * trades were numbered.
   */
  group?: number
}

/**
 * Which cell is filled at a given moment. Identity until picks are traded, so a
 * draft without trades behaves exactly as it did before.
 */
export function cellForMoment(moment: number, trades: PickTrade[]): number {
  let cell = moment
  for (const trade of trades) {
    if (cell === trade.a) cell = trade.b
    else if (cell === trade.b) cell = trade.a
  }
  return cell
}

/**
 * When a given cell gets filled. Each swap is its own inverse, so undoing the
 * composition means applying them again in reverse.
 */
export function momentForCell(cell: number, trades: PickTrade[]): number {
  let moment = cell
  for (let i = trades.length - 1; i >= 0; i--) {
    const trade = trades[i]
    if (moment === trade.a) moment = trade.b
    else if (moment === trade.b) moment = trade.a
  }
  return moment
}

/** Which manager chooses at this moment: the owner of the cell it fills. */
export function slotAtMoment(moment: number, session: Session): number {
  return slotForPick(cellForMoment(moment, session.trades), session.leagueSize)
}

/** Every cell belonging to a slot, in the order that slot now picks them. */
export function cellsForSlot(session: Session, slot: number): number[] {
  const rounds = draftRounds(session.rosterConfig)
  const cells: number[] = []
  for (let round = 1; round <= rounds; round++) {
    cells.push(pickForRound(round, session.leagueSize, slot))
  }
  return cells.sort(
    (x, y) => momentForCell(x, session.trades) - momentForCell(y, session.trades),
  )
}

/** The moments at which a slot chooses, earliest first. */
export function momentsForSlot(session: Session, slot: number): number[] {
  return cellsForSlot(session, slot)
    .map((cell) => momentForCell(cell, session.trades))
    .sort((x, y) => x - y)
}

/**
 * The trades that swap two managers' next `count` selections.
 *
 * Pairs them up in turn order — my next for your next, my one after for yours —
 * which is how the swap is agreed out loud. Only picks that have not happened yet
 * can move, so a trade agreed mid-round cannot rewrite the board behind it.
 */
export function swapNextPicks(
  session: Session,
  slotA: number,
  slotB: number,
  count: number,
  fromMoment: number,
): PickTrade[] {
  if (slotA === slotB || count < 1) return []
  const upcoming = (slot: number) =>
    cellsForSlot(session, slot).filter(
      (cell) => momentForCell(cell, session.trades) >= fromMoment,
    )

  const a = upcoming(slotA)
  const b = upcoming(slotB)
  const pairs = Math.min(count, a.length, b.length)
  const trades: PickTrade[] = []
  for (let i = 0; i < pairs; i++) trades.push({ a: a[i], b: b[i] })
  return trades
}

/** How many selections a trade moved a pick, for showing what it did. */
export function tradeSummary(
  trade: PickTrade,
  session: Session,
): { cell: number; slot: number; movedTo: number }[] {
  return [trade.a, trade.b].map((cell) => ({
    cell,
    slot: slotForPick(cell, session.leagueSize),
    movedTo: momentForCell(cell, session.trades),
  }))
}

/** True when this cell no longer gets filled at its own number. */
export function isTraded(cell: number, trades: PickTrade[]): boolean {
  return momentForCell(cell, trades) !== cell
}


/** The number the next agreement gets. Trades are numbered from one. */
export function nextTradeGroup(trades: PickTrade[]): number {
  return trades.reduce((highest, trade) => Math.max(highest, trade.group ?? 0), 0) + 1
}

/** Every swap this cell took part in: its trade number and the pick it went for. */
export function tradesForCell(
  cell: number,
  trades: PickTrade[],
): Array<{ group: number; partner: number }> {
  const found: Array<{ group: number; partner: number }> = []
  trades.forEach((trade, index) => {
    const partner = trade.a === cell ? trade.b : trade.b === cell ? trade.a : null
    if (partner !== null) found.push({ group: trade.group ?? index + 1, partner })
  })
  return found
}

/** The cells in one agreement, in pick order, for describing it out loud. */
export function cellsInGroup(group: number, trades: PickTrade[]): number[] {
  return trades
    .filter((trade, index) => (trade.group ?? index + 1) === group)
    .flatMap((trade) => [trade.a, trade.b])
    .sort((x, y) => x - y)
}
