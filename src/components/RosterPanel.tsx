import { useState } from 'react'
import { Undo2, X } from 'lucide-react'
import type { Player, PlayerStatus, Position, Session } from '../types'
import { FLEX_POSITIONS } from '../types'
import { bestAtPosition, fillRoster, openNeeds, type RosterSlot } from '../lib/draft'
import { adpLabel, adpTooltip } from '../lib/adp'
import { BadgeIcons } from './ui'

/** Section 7.6: my roster, what is still open, and the best player for that hole. */
export default function RosterPanel({
  session,
  onCorrect,
}: {
  session: Session
  onCorrect: (playerId: string, status: PlayerStatus) => void
}) {
  const [correcting, setCorrecting] = useState<string | null>(null)
  const mine = session.players.filter((p) => p.status === 'mine')
  const slots = fillRoster(mine, session.rosterConfig)
  const needs = openNeeds(slots)
  const hints = needHints(needs, session)

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-baseline gap-2 px-3 py-2">
        <h2 className="text-sm font-bold">My roster</h2>
        <span className="ml-auto text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
          {mine.length} picked
        </span>
      </div>

      {hints.length > 0 && (
        <div className="mx-3 mb-2 shrink-0 rounded-lg bg-stone-100 p-2 dark:bg-stone-800">
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
            Still need
          </div>
          <ul className="space-y-0.5">
            {hints.map((hint) => (
              <li key={hint.label} className="flex items-baseline gap-1.5 text-[12px]">
                <span className="font-bold">{hint.label}</span>
                {hint.player ? (
                  <span className="min-w-0 truncate text-stone-600 dark:text-stone-300">
                    Best: {hint.player.name}
                    {hint.player.tier !== null && ` (Tier ${hint.player.tier})`}
                  </span>
                ) : (
                  <span className="text-stone-400">nothing left</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="column-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {slots.map((slot, index) => (
          <SlotRow
            key={index}
            slot={slot}
            leagueSize={session.leagueSize}
            correcting={correcting === slot.player?.id}
            onToggleCorrect={() =>
              setCorrecting((current) =>
                slot.player && current !== slot.player.id ? slot.player.id : null,
              )
            }
            onCorrect={(status) => {
              if (slot.player) onCorrect(slot.player.id, status)
              setCorrecting(null)
            }}
          />
        ))}
      </ul>
    </div>
  )
}

function SlotRow({
  slot,
  leagueSize,
  correcting,
  onToggleCorrect,
  onCorrect,
}: {
  slot: RosterSlot
  leagueSize: number
  correcting: boolean
  onToggleCorrect: () => void
  onCorrect: (status: PlayerStatus) => void
}) {
  const player = slot.player
  const value =
    player?.adpOverall != null && player.draftedAtPick != null
      ? player.adpOverall - player.draftedAtPick
      : null

  return (
    <li className={`border-b border-stone-100 last:border-0 dark:border-stone-800 ${player ? '' : 'opacity-60'}`}>
      <div className="flex items-center gap-2 py-1.5">
        <span className="w-9 shrink-0 rounded bg-stone-200 px-1 py-0.5 text-center text-[10px] font-bold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {slot.label}
        </span>
        {player ? (
          <button
            type="button"
            onClick={onToggleCorrect}
            title="Not your pick? Tap to fix."
            className="tap-target flex min-w-0 flex-1 items-center gap-2 rounded text-left hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1">
                <span className="truncate text-[12px] font-medium">{player.name}</span>
                <BadgeIcons badges={player.badges} size={11} />
              </span>
              <span className="text-[10px] text-stone-500 dark:text-stone-400">
                {player.position} · {player.team} · pick {player.draftedAtPick}
              </span>
            </span>
            <span className="shrink-0 pr-1 text-right">
              <span
                className="block text-[11px] tabular-nums text-stone-500 dark:text-stone-400"
                title={adpTooltip(player.adp12, player.adpOverall, leagueSize)}
              >
                {adpLabel(player.adpOverall)}
              </span>
              {value !== null && (
                <span
                  className={`block text-[10px] font-semibold tabular-nums ${
                    value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400'
                  }`}
                  title="ADP minus the pick you spent"
                >
                  {value > 0 ? `+${value}` : value}
                </span>
              )}
            </span>
          </button>
        ) : (
          <span className="text-[12px] text-stone-400">open</span>
        )}
      </div>

      {correcting && player && (
        <div className="mb-1.5 ml-9 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onCorrect('drafted')}
            className="tap-target flex items-center gap-1 rounded-lg border border-stone-300 px-2 text-[11px] font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
          >
            <X size={12} /> Not my pick
          </button>
          <button
            type="button"
            onClick={() => onCorrect('available')}
            className="tap-target flex items-center gap-1 rounded-lg border border-stone-300 px-2 text-[11px] font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
          >
            <Undo2 size={12} /> Back on the board
          </button>
        </div>
      )}
    </li>
  )
}

/** One hint per distinct open slot, with the best remaining body for it. */
function needHints(needs: string[], session: Session): Array<{ label: string; player: Player | null }> {
  const seen = new Set<string>()
  const out: Array<{ label: string; player: Player | null }> = []
  for (const need of needs) {
    if (seen.has(need)) continue
    seen.add(need)
    const positions: Position[] = need === 'FLEX' ? FLEX_POSITIONS : [need as Position]
    let best: Player | null = null
    for (const position of positions) {
      const candidate = bestAtPosition(session.players, position)
      if (!candidate) continue
      if (!best || (candidate.adpOverall ?? Infinity) < (best.adpOverall ?? Infinity)) best = candidate
    }
    out.push({ label: need, player: best })
  }
  return out
}
