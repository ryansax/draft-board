import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import type { Session } from '../types'
import { buildDraftGrid, managerRosters, roundForPick, type GridCell } from '../lib/insights'
import { usePlayerImages } from '../lib/usePlayerImages'
import { momentForCell } from '../lib/trades'
import { useSessionStore } from '../store/session'
import type { HeadshotLookup } from '../lib/headshots'
import DraftCard from './DraftCard'

interface Props {
  session: Session
  /** The cell about to be filled. After a trade this is not the moment count. */
  clockCell: number
  onEditPick: (cell: number) => void
  onRenameManager: (slot: number, name: string) => void
}

/** The whole draft, round by round, colour-coded by position. */
export default function DraftGrid({ session, clockCell, onEditPick, onRenameManager }: Props) {
  const grid = buildDraftGrid(session)
  const rosters = managerRosters(session)
  const [editing, setEditing] = useState<number | null>(null)
  const currentRound = roundForPick(clockCell, session.leagueSize)
  const faces = usePlayerImages(useSessionStore((s) => s.settings.playerImages))
  const currentRowRef = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentRound])

  return (
    <div className="column-scroll h-full overflow-auto p-2">
      <table className="w-full border-separate border-spacing-0.5">
        <thead className="sticky top-0 z-20">
          <tr>
            <th className="w-9 bg-stone-100 text-[10px] font-semibold text-stone-400 dark:bg-stone-950">
              RD
            </th>
            {Array.from({ length: session.leagueSize }, (_, i) => i + 1).map((slot) => {
              const mine = slot === session.draftSlot
              const taken = rosters.get(slot)?.length ?? 0
              return (
                <th
                  key={slot}
                  className={`min-w-24 rounded-t px-1 py-1 align-bottom ${
                    mine
                      ? 'bg-emerald-600 text-white'
                      : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200'
                  }`}
                >
                  {editing === slot ? (
                    <input
                      autoFocus
                      defaultValue={session.managers[slot - 1]}
                      onBlur={(e) => {
                        onRenameManager(slot, e.target.value.trim() || `Team ${slot}`)
                        setEditing(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      className="w-full rounded bg-white px-1 py-0.5 text-[11px] text-stone-900"
                    />
                  ) : (
                    <button
                      onClick={() => setEditing(slot)}
                      title="Rename this manager"
                      className="flex w-full min-h-9 items-center justify-center gap-1"
                    >
                      {/* Fantasy team names run long; small enough to survive. */}
                      <span className="truncate text-[10px] font-bold">
                        {session.managers[slot - 1]}
                      </span>
                      <Pencil size={10} className="shrink-0 opacity-50" />
                    </button>
                  )}
                  <div className="text-[9px] font-normal opacity-70">
                    slot {slot} · {taken}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {grid.map((row) => {
            const isCurrentRound = row[0].round === currentRound
            return (
              <tr key={row[0].round} ref={isCurrentRound ? currentRowRef : undefined}>
                <td
                  className={`w-9 rounded text-center text-[11px] font-bold tabular-nums ${
                    isCurrentRound
                      ? 'bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900'
                      : 'text-stone-400'
                  }`}
                >
                  {row[0].round}
                </td>
                {row.map((cell) => (
                  <Cell
                    key={cell.pick}
                    cell={cell}
                    clockCell={clockCell}
                    filledAt={momentForCell(cell.pick, session.trades)}
                    faces={faces}
                    onEdit={onEditPick}
                  />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Cell({
  cell,
  clockCell,
  filledAt,
  faces,
  onEdit,
}: {
  cell: GridCell
  /** The cell about to be filled. After a trade this is not the moment count. */
  clockCell: number
  /** Which selection fills this cell. Differs from the cell only after a trade. */
  filledAt: number
  faces: HeadshotLookup | null
  onEdit: (cell: number) => void
}) {
  const onTheClock = cell.pick === clockCell
  const traded = filledAt !== cell.pick
  const player = cell.player
  /**
   * This pick belongs to my slot but the player was logged as someone else's — most
   * likely the counter drifted or the pick was marked with the wrong action.
   */
  const misattributed = Boolean(cell.isMine && player && player.status !== 'mine')

  if (!player) {
    return (
      <td
        className={`h-14 min-w-24 rounded p-0 text-center align-middle ${
          onTheClock
            ? 'bg-amber-200 ring-2 ring-amber-500 dark:bg-amber-900'
            : cell.isMine
              ? 'bg-emerald-50 dark:bg-emerald-950/40'
              : 'bg-stone-100 dark:bg-stone-900'
        }`}
      >
        <button
          onClick={() => onEdit(cell.pick)}
          title={`Pick ${cell.pick} — click to log a player here`}
          className="h-14 w-full px-1"
        >
          <span
            className={`text-[10px] tabular-nums ${
              onTheClock ? 'font-bold text-amber-900 dark:text-amber-100' : 'text-stone-400'
            }`}
          >
            {onTheClock ? 'ON THE CLOCK' : traded ? `${cell.pick} → ${filledAt}` : cell.pick}
          </span>
        </button>
      </td>
    )
  }

  return (
    <td className="h-14 min-w-24 max-w-32 p-0 align-middle">
      {/* Same card as the room display, but picks stay whole numbers here. */}
      <button onClick={() => onEdit(cell.pick)} className="block h-14 w-full text-[11px]">
        <DraftCard
          player={player}
          pickLabel={String(cell.pick)}
          faces={faces}
          isMine={cell.isMine}
          flagged={misattributed}
          title={
            misattributed
              ? `Pick ${cell.pick} is your slot, but ${player.name} is not on your roster — mark him as yours, or nudge the pick counter.`
              : `Pick ${cell.pick} — ${player.name} (${player.position}${player.rank}, ${player.team})`
          }
        />
      </button>
    </td>
  )
}
