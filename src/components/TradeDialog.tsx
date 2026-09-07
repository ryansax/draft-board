import { useMemo, useState } from 'react'
import { ArrowLeftRight, Undo2, X } from 'lucide-react'
import type { Session } from '../types'
import { Button } from './ui'
import { cellForMoment, momentForCell, momentsForSlot, swapNextPicks } from '../lib/trades'
import { slotForPick } from '../lib/insights'

/**
 * Record a pick swap agreed at the table.
 *
 * The trade moves *when* two managers choose. Neither leaves his own column, so
 * each column still reads as that manager's roster — what changes is the order
 * they come off the board.
 */
export default function TradeDialog({
  session,
  moment,
  onTrade,
  onUndoTrade,
  onClose,
}: {
  session: Session
  /** How many selections deep the draft is. Only later picks can move. */
  moment: number
  onTrade: (slotA: number, slotB: number, count: number) => void
  onUndoTrade: () => void
  onClose: () => void
}) {
  const slots = Array.from({ length: session.leagueSize }, (_, i) => i + 1)
  const [slotA, setSlotA] = useState(session.draftSlot)
  const [slotB, setSlotB] = useState(
    session.draftSlot === 1 ? Math.min(2, session.leagueSize) : 1,
  )
  const [count, setCount] = useState(2)

  const name = (slot: number) => session.managers[slot - 1] ?? `Team ${slot}`

  // What this trade would actually do, worked out before it is committed.
  const preview = useMemo(() => {
    const swaps = swapNextPicks(session, slotA, slotB, count, moment)
    return swaps.map((swap) => {
      const momentA = momentForCell(swap.a, session.trades)
      const momentB = momentForCell(swap.b, session.trades)
      return {
        aName: name(slotForPick(swap.a, session.leagueSize)),
        bName: name(slotForPick(swap.b, session.leagueSize)),
        momentA,
        momentB,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, slotA, slotB, count, moment])

  const existing = session.trades.length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Trade picks</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 text-stone-500">
            <X size={18} />
          </button>
        </div>

        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
          Swaps whose turn it is. Each manager's players stay in their own column, so a
          column is still that manager's roster.
        </p>

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <label className="text-xs font-medium">
            <span className="text-stone-500 dark:text-stone-400">Manager</span>
            <select
              value={slotA}
              onChange={(e) => setSlotA(Number(e.target.value))}
              className="mt-1 min-h-9 w-full rounded border border-stone-300 bg-transparent px-2 text-sm dark:border-stone-700"
            >
              {slots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}. {name(slot)}
                </option>
              ))}
            </select>
          </label>
          <ArrowLeftRight size={16} className="mb-3 text-stone-400" />
          <label className="text-xs font-medium">
            <span className="text-stone-500 dark:text-stone-400">Manager</span>
            <select
              value={slotB}
              onChange={(e) => setSlotB(Number(e.target.value))}
              className="mt-1 min-h-9 w-full rounded border border-stone-300 bg-transparent px-2 text-sm dark:border-stone-700"
            >
              {slots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}. {name(slot)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 block text-xs font-medium">
          <span className="text-stone-500 dark:text-stone-400">How many picks each</span>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="mt-1 min-h-9 w-full rounded border border-stone-300 bg-transparent px-2 text-sm dark:border-stone-700"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'Next pick' : `Next ${n} picks`}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 rounded-lg bg-stone-100 p-3 text-sm dark:bg-stone-800">
          {preview.length === 0 ? (
            <span className="text-stone-500 dark:text-stone-400">
              {slotA === slotB
                ? 'Pick two different managers.'
                : 'No upcoming picks left to swap.'}
            </span>
          ) : (
            <ul className="space-y-1">
              {preview.map((row, i) => (
                <li key={i} className="tabular-nums">
                  <span className="font-semibold">{row.bName}</span> picks at{' '}
                  <span className="font-semibold">{row.momentA}</span>,{' '}
                  <span className="font-semibold">{row.aName}</span> picks at{' '}
                  <span className="font-semibold">{row.momentB}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {existing > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-stone-200 p-2 text-xs dark:border-stone-700">
            <span className="text-stone-500 dark:text-stone-400">
              {existing} pick {existing === 1 ? 'swap' : 'swaps'} in effect
              {' · '}
              you pick next at {momentsForSlot(session, session.draftSlot).find((m) => m >= moment) ?? '—'}
            </span>
            <button
              onClick={onUndoTrade}
              className="flex items-center gap-1 rounded px-2 py-1 font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              <Undo2 size={13} /> Undo last
            </button>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose} className="px-3">
            Cancel
          </Button>
          <Button
            onClick={() => {
              onTrade(slotA, slotB, count)
              onClose()
            }}
            disabled={preview.length === 0}
            className="bg-emerald-600 px-3 text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            Swap {preview.length === 1 ? 'pick' : 'picks'}
          </Button>
        </div>

        <p className="mt-3 text-[11px] text-stone-400">
          On the clock now: pick {moment}, which fills cell{' '}
          {cellForMoment(moment, session.trades)}.
        </p>
      </div>
    </div>
  )
}
