import { Minus, Plus } from 'lucide-react'
import { Button } from './ui'

interface Props {
  currentPick: number
  upcoming: number[]
  myNextPick: number | null
  leagueSize: number
  draftSlot: number
  onNudge: (delta: number) => void
}

/** Sections 7.1 and 7.2: where the draft is, and when I'm on the clock. */
export default function PickStrip({
  currentPick,
  upcoming,
  myNextPick,
  leagueSize,
  draftSlot,
  onNudge,
}: Props) {
  const away = myNextPick === null ? null : myNextPick - currentPick
  const onTheClock = away === 0

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={() => onNudge(-1)} aria-label="Step the pick counter back" className="!px-2">
          <Minus size={16} />
        </Button>
        <div className="text-center">
          <div className="text-[10px] leading-none font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">
            Pick
          </div>
          <div className="text-xl leading-tight font-bold tabular-nums">{currentPick}</div>
        </div>
        <Button variant="ghost" onClick={() => onNudge(1)} aria-label="Step the pick counter forward" className="!px-2">
          <Plus size={16} />
        </Button>
      </div>

      <div
        className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
          onTheClock
            ? 'bg-emerald-600 text-white'
            : away !== null && away <= 3
              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
              : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200'
        }`}
      >
        {away === null
          ? 'Your picks are done'
          : onTheClock
            ? "You're on the clock"
            : `You're up in ${away} selection${away === 1 ? '' : 's'}`}
      </div>

      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        <span className="shrink-0 text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">
          {leagueSize}tm · slot {draftSlot}
        </span>
        {upcoming.map((pick) => (
          <span
            key={pick}
            className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
              pick === myNextPick
                ? 'bg-emerald-600 text-white'
                : 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
            }`}
          >
            {pick}
          </span>
        ))}
      </div>
    </div>
  )
}
