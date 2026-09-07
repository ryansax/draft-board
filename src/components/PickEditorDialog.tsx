import { useMemo, useState } from 'react'
import { Search, Trash2, X } from 'lucide-react'
import type { Player, Session } from '../types'
import { Button, PositionPill } from './ui'
import { searchPlayers } from '../lib/draft'
import { momentForCell } from '../lib/trades'
import { slotForPick } from '../lib/insights'

/**
 * Correct a pick already on the board.
 *
 * Mistakes surface late — a name misheard three rounds ago, two players with
 * nearly the same name. Unwinding twenty picks to fix one is not an option
 * mid-draft, so any cell can be edited in place and everything after it stays
 * exactly where it is.
 */
export default function PickEditorDialog({
  session,
  cell,
  onSet,
  onClose,
}: {
  session: Session
  /** The board cell being corrected. */
  cell: number
  onSet: (cell: number, playerId: string | null) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  const occupant = useMemo(
    () => session.players.find((p) => p.draftedAtPick === cell && p.status !== 'available') ?? null,
    [session.players, cell],
  )

  const results = useMemo(() => searchPlayers(session.players, query, 8), [session.players, query])

  const slot = slotForPick(cell, session.leagueSize)
  const manager = session.managers[slot - 1] ?? `Team ${slot}`
  const filledAt = momentForCell(cell, session.trades)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-stone-900/50 p-4 pt-[10vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Pick {cell}</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {manager}
              {filledAt !== cell && ` · taken with selection ${filledAt}`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-stone-500">
            <X size={18} />
          </button>
        </div>

        <div className="mt-3 rounded-lg bg-stone-100 p-3 text-sm dark:bg-stone-800">
          {occupant ? (
            <span className="flex items-center gap-2">
              <PositionPill position={occupant.position} />
              <span className="font-semibold">{occupant.name}</span>
              <span className="text-stone-500 dark:text-stone-400">{occupant.team}</span>
            </span>
          ) : (
            <span className="text-stone-500 dark:text-stone-400">Nobody here yet.</span>
          )}
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
            {occupant ? 'Replace with' : 'Put someone here'}
          </span>
          <span className="mt-1 flex items-center gap-2 rounded border border-stone-300 px-2 dark:border-stone-700">
            <Search size={14} className="shrink-0 text-stone-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players"
              className="min-h-9 w-full bg-transparent text-sm focus:outline-none"
            />
          </span>
        </label>

        {results.length > 0 && (
          <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700">
            {results.map((player) => (
              <li key={player.id}>
                <button
                  onClick={() => {
                    onSet(cell, player.id)
                    onClose()
                  }}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <PositionPill position={player.position} />
                  <span className="min-w-0 flex-1 truncate font-medium">{player.name}</span>
                  <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
                    {player.team}
                  </span>
                  <ElsewhereNote player={player} cell={cell} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          {occupant ? (
            <button
              onClick={() => {
                onSet(cell, null)
                onClose()
              }}
              className="flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
            >
              <Trash2 size={14} /> Clear this pick
            </button>
          ) : (
            <span />
          )}
          <Button onClick={onClose} className="px-3">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Warn when the player picked is already logged somewhere else on the board. */
function ElsewhereNote({ player, cell }: { player: Player; cell: number }) {
  if (player.draftedAtPick === null || player.draftedAtPick === cell) return null
  return (
    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      moves from {player.draftedAtPick}
    </span>
  )
}
