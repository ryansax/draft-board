import type { Player, PlayerStatus, Position } from '../types'

/** Defenses and kickers: plain numbered lists, no ADP or tiers. */
export default function RailList({
  position,
  players,
  myTurn,
  onMark,
  onTap,
}: {
  position: Position
  players: Player[]
  myTurn: boolean
  onMark: (playerId: string, status: PlayerStatus) => void
  onTap: (playerId: string, forceOpposite?: boolean) => void
}) {
  return (
    <ul>
      {players.map((player) => {
        const marked = player.status !== 'available'
        const mine = player.status === 'mine'
        return (
          <li
            key={player.id}
            className={`border-b border-stone-100 last:border-0 dark:border-stone-800 ${
              mine ? 'border-l-4 border-l-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30' : ''
            }`}
          >
            <div className="flex items-stretch">
              <button
                type="button"
                onClick={(e) => {
                  if (marked) onMark(player.id, 'available')
                  else onTap(player.id, e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)
                }}
                aria-label={`${player.name}${marked ? ', drafted — tap to undo' : ''}`}
                className={`tap-target flex min-w-0 flex-1 items-center gap-2 px-2 text-left ${
                  marked ? 'opacity-55' : ''
                }`}
              >
                <span className="w-5 shrink-0 text-right text-[11px] font-semibold tabular-nums text-stone-400">
                  {player.rank}
                </span>
                <span className={`truncate text-[13px] ${marked ? 'line-through' : ''}`}>{player.name}</span>
                {player.team && position === 'K' && (
                  <span className="ml-auto shrink-0 text-[10px] text-stone-500 dark:text-stone-400">
                    {player.team}
                  </span>
                )}
              </button>
              {!marked && (
                <button
                  type="button"
                  onClick={() => onTap(player.id, true)}
                  aria-label={
                    myTurn
                      ? `Mark ${player.name} as drafted by someone else`
                      : `Mark ${player.name} as my pick`
                  }
                  className="tap-target w-9 shrink-0 border-l border-stone-100 text-[10px] font-bold text-stone-400 hover:bg-emerald-50 hover:text-emerald-700 dark:border-stone-800 dark:hover:bg-emerald-950"
                >
                  {myTurn ? 'THEM' : 'ME'}
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
