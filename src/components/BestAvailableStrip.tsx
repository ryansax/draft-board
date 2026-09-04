import type { Player } from '../types'
import { adpLabel, adpTooltip } from '../lib/adp'
import { BadgeIcons, PositionPill } from './ui'

/** Section 7.7: a quick sanity check between my picks. */
export default function BestAvailableStrip({
  players,
  leagueSize,
  onPick,
}: {
  players: Player[]
  leagueSize: number
  onPick: (playerId: string) => void
}) {
  if (players.length === 0) return null
  return (
    <div className="flex items-center gap-2 overflow-x-auto px-1 py-1">
      <span className="shrink-0 text-[10px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
        Best available
      </span>
      {players.map((player) => {
        return (
          <button
            key={player.id}
            onClick={() => onPick(player.id)}
            title={`Jump to ${player.name} — ${adpTooltip(player.adp12, player.adpOverall, leagueSize)}`}
            className="tap-target flex shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
          >
            <PositionPill position={player.position} />
            <span className="text-[13px] font-medium whitespace-nowrap">{player.name}</span>
            <BadgeIcons badges={player.badges} size={12} />
            <span className="text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
              {adpLabel(player.adpOverall)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
