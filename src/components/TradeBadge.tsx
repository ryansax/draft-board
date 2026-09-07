import { ArrowLeftRight } from 'lucide-react'
import { overallToRoundPick } from '../lib/adp'
import { tradesForCell, type PickTrade } from '../lib/trades'

/**
 * The mark on a pick that changed hands.
 *
 * Numbered by agreement, so the four cells of one two-for-two handshake all read
 * "1" and can be picked out of the board at a glance. The arrow says what this
 * pick went for: on cell 57 traded against 60, "57 → 60".
 *
 * Sizes in `em` like the card it sits on, so the same badge works on a phone-sized
 * grid cell and on a television.
 */
export default function TradeBadge({
  cell,
  trades,
  leagueSize,
  /** The room display talks in round.pick; the control window uses whole numbers. */
  roundDotPick = false,
}: {
  cell: number
  trades: PickTrade[]
  leagueSize: number
  roundDotPick?: boolean
}) {
  const involved = tradesForCell(cell, trades)
  if (involved.length === 0) return null

  const label = (pick: number) =>
    roundDotPick ? overallToRoundPick(pick, leagueSize).label : String(pick)

  return (
    <>
      {involved.map(({ group, partner }) => (
        <span
          key={`${group}-${partner}`}
          title={`Trade ${group}: this pick was swapped for ${label(partner)}`}
          className="flex shrink-0 items-center gap-[0.2em] rounded-full bg-black/30 px-[0.35em] py-[0.05em] font-bold tabular-nums"
        >
          <ArrowLeftRight size="0.85em" className="shrink-0" aria-hidden />
          <span className="rounded-full bg-white/85 px-[0.28em] text-[0.85em] leading-tight text-black">
            {group}
          </span>
          <span className="whitespace-nowrap">
            {label(cell)} → {label(partner)}
          </span>
        </span>
      ))}
    </>
  )
}
