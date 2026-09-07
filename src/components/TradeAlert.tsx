import { useEffect, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import type { Session } from '../types'
import { overallToRoundPick } from '../lib/adp'
import { slotForPick } from '../lib/insights'
import { cellsInGroup, momentForCell, type PickTrade } from '../lib/trades'
import { loadSting, playPickSting } from '../lib/sting'

/** Long enough for a room to read four picks and look back up. */
const HOLD_MS = 6000

export interface TradeAlertRequest {
  group: number
  session: Session
}

/**
 * The room's notice that the order just changed.
 *
 * A trade rearranges who is up next, which is the one thing a draft board is for,
 * so it gets the same treatment as a pick: a sound, a banner, and the detail held
 * on screen long enough to be read from across the room.
 */
export default function TradeAlert({
  request,
  sound,
  speak,
  onFinished,
}: {
  request: TradeAlertRequest
  /** Fun mode is on and the room has let audio through. */
  sound: boolean
  /** Say it out loud as well, when there is a voice to say it with. */
  speak: ((text: string) => Promise<void>) | null
  onFinished: () => void
}) {
  const [leaving, setLeaving] = useState(false)
  const { session, group } = request
  const { leagueSize } = session

  const label = (cell: number) => overallToRoundPick(cell, leagueSize).label
  const manager = (cell: number) =>
    session.managers[slotForPick(cell, leagueSize) - 1] ?? `Team ${slotForPick(cell, leagueSize)}`

  const swaps: PickTrade[] = session.trades.filter(
    (trade, index) => (trade.group ?? index + 1) === group,
  )
  const cells = cellsInGroup(group, session.trades)
  // Two managers, named once each rather than repeated down the list.
  const sides = [...new Set(cells.map(manager))]

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (sound) {
        await loadSting()
        if (cancelled) return
        playPickSting()
      }
      if (speak) {
        const said = `Trade. ${sides.join(' and ')} have swapped picks.`
        await speak(said).catch(() => {})
      }
      await new Promise((r) => setTimeout(r, HOLD_MS))
      if (cancelled) return
      setLeaving(true)
      await new Promise((r) => setTimeout(r, 400))
      if (!cancelled) onFinished()
    }
    void run()
    return () => {
      cancelled = true
    }
    // Runs once for the trade it was mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-stone-950/95 transition-opacity duration-400 ${
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div className="anim-sweep anim-shine flex items-center gap-[1.5vw] overflow-hidden rounded-[0.6vw] bg-amber-400 px-[3vw] py-[1.6vh] shadow-lg">
        <ArrowLeftRight className="h-[3.4vw] w-[3.4vw] shrink-0 text-amber-950" />
        <span className="font-display text-[clamp(1.2rem,4.4vw,5.6rem)] leading-none tracking-[0.02em] text-amber-950">
          TRADE
        </span>
      </div>

      <div
        className="anim-rise mt-[1.6vh] font-display text-[clamp(0.75rem,1.7vw,2.2rem)] tracking-[0.12em] text-stone-400 uppercase"
        style={{ animationDelay: '0.2s' }}
      >
        Trade {group} · {sides.join(' ↔ ')}
      </div>

      <ul className="anim-rise mt-[3vh] space-y-[1.2vh]" style={{ animationDelay: '0.35s' }}>
        {swaps.map((swap, i) => (
          <li
            key={i}
            className="flex items-center gap-[1.4vw] text-[clamp(0.9rem,2.4vw,3rem)] font-bold tabular-nums text-white"
          >
            <span className="rounded-lg bg-white/10 px-[1vw] py-[0.4vh]">{label(swap.a)}</span>
            <ArrowLeftRight className="h-[1.8vw] w-[1.8vw] shrink-0 text-amber-400" />
            <span className="rounded-lg bg-white/10 px-[1vw] py-[0.4vh]">{label(swap.b)}</span>
          </li>
        ))}
      </ul>

      <p className="mt-[3vh] text-[clamp(0.7rem,1.3vw,1.6rem)] text-stone-400">
        {manager(cells[0])} now picks at {label(pickAfter(swaps, session, 0))}
      </p>
    </div>
  )
}

/** Where the first named manager now picks, for the line under the swaps. */
function pickAfter(swaps: PickTrade[], session: Session, index: number): number {
  const swap = swaps[index]
  if (!swap) return 0
  // His own cell is filled at the moment his partner's used to be.
  return momentForCell(swap.a, session.trades)
}
