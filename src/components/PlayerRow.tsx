import { memo } from 'react'
import { Undo2 } from 'lucide-react'
import type { Player, PlayerStatus } from '../types'
import {
  AVAILABILITY_LABELS,
  adpLabel,
  adpTooltip,
  availabilityFor,
  isFallingValue,
} from '../lib/adp'
import { BadgeIcons, Chip } from './ui'

export const HIGH_RISK = 7.5
export const HIGH_UPSIDE = 8.5

interface Props {
  player: Player
  leagueSize: number
  currentPick: number
  myNextPick: number | null
  menuOpen: boolean
  /** True when the pick on the clock is mine. */
  myTurn: boolean
  onMark: (playerId: string, status: PlayerStatus) => void
  onTap: (playerId: string, forceOpposite?: boolean) => void
  onToggleMenu: (playerId: string | null) => void
}

function PlayerRowInner({
  player,
  leagueSize,
  currentPick,
  myNextPick,
  menuOpen,
  myTurn,
  onMark,
  onTap,
  onToggleMenu,
}: Props) {
  const marked = player.status !== 'available'
  const mine = player.status === 'mine'
  const adp = adpLabel(player.adpOverall)
  const availability = marked ? null : availabilityFor(player.adpOverall, myNextPick)
  const falling = !marked && isFallingValue(player.adpOverall, currentPick)

  const handleClick = (e: React.MouseEvent) => {
    if (marked) {
      onToggleMenu(menuOpen ? null : player.id)
      return
    }
    // On my own pick a plain tap means "I took him"; a modifier forces the opposite.
    onTap(player.id, e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)
  }

  return (
    <div
      id={`row-${player.id}`}
      className={`no-select relative scroll-mt-12 border-b border-stone-200/70 dark:border-stone-800 ${
        mine
          ? 'border-l-4 border-l-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
          : marked
            ? 'bg-stone-100/60 dark:bg-stone-900/60'
            : 'bg-white dark:bg-stone-900'
      }`}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={handleClick}
          aria-label={`${player.name}, ${player.position} ${player.rank}${marked ? `, ${mine ? 'yours' : 'drafted'}` : ''}`}
          className={`tap-target flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left active:bg-stone-200 dark:active:bg-stone-800 ${
            marked ? 'opacity-55' : ''
          }`}
        >
          <span className="w-6 shrink-0 text-right text-[11px] font-semibold tabular-nums text-stone-400">
            {player.rank}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">
              <span
                className={`truncate text-[13px] leading-tight font-medium ${
                  marked ? 'line-through decoration-stone-500/70' : ''
                }`}
              >
                {player.name}
              </span>
              <BadgeIcons badges={player.badges} />
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[10px] leading-tight text-stone-500 dark:text-stone-400">
              <span className="font-medium">{player.team}</span>
              {marked && player.draftedAtPick !== null && (
                <>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{mine ? 'mine' : 'gone'} @{player.draftedAtPick}</span>
                </>
              )}
            </span>
            {(availability || falling) && (
              <span className="mt-1 flex flex-wrap gap-1">
                {availability && (
                  <Chip tone={availability}>{AVAILABILITY_LABELS[availability]}</Chip>
                )}
                {falling && <Chip tone="falling">Value falling</Chip>}
              </span>
            )}
          </span>

          <span
            className="shrink-0 text-right"
            title={adpTooltip(player.adp12, player.adpOverall, leagueSize)}
          >
            <span
              className={`block text-[13px] leading-tight font-semibold tabular-nums ${
                player.adpOverall === null ? 'text-stone-400' : ''
              }`}
            >
              {adp}
            </span>
            {(player.risk !== null || player.upside !== null) && (
              <span className="mt-0.5 flex justify-end gap-1 text-[10px] leading-tight tabular-nums">
                <span
                  className={
                    player.risk !== null && player.risk >= HIGH_RISK
                      ? 'rounded bg-rose-100 px-1 font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                      : 'text-stone-500 dark:text-stone-400'
                  }
                  title={`Risk ${player.risk}`}
                >
                  {player.risk?.toFixed(1)}
                </span>
                <span
                  className={
                    player.upside !== null && player.upside >= HIGH_UPSIDE
                      ? 'rounded bg-emerald-100 px-1 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'text-stone-500 dark:text-stone-400'
                  }
                  title={`Upside ${player.upside}`}
                >
                  {player.upside?.toFixed(1)}
                </span>
              </span>
            )}
          </span>
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
            title={myTurn ? 'Someone else took him' : 'Mark as mine'}
            className={`tap-target w-9 shrink-0 border-l border-stone-200/70 text-[10px] font-bold tracking-wide dark:border-stone-800 ${
              myTurn
                ? 'text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200'
                : 'text-stone-400 hover:bg-emerald-50 hover:text-emerald-700 active:bg-emerald-100 dark:hover:bg-emerald-950 dark:hover:text-emerald-300'
            }`}
          >
            {myTurn ? 'THEM' : 'ME'}
          </button>
        )}
      </div>

      {menuOpen && (
        <div className="absolute right-1 z-30 mt-0.5 w-44 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-800">
          <MenuItem
            onClick={() => {
              onMark(player.id, 'available')
              onToggleMenu(null)
            }}
          >
            <Undo2 size={14} /> Undo — still available
          </MenuItem>
          {!mine && (
            <MenuItem
              onClick={() => {
                onMark(player.id, 'mine')
                onToggleMenu(null)
              }}
            >
              Mark as mine
            </MenuItem>
          )}
          {mine && (
            <MenuItem
              onClick={() => {
                onMark(player.id, 'drafted')
                onToggleMenu(null)
              }}
            >
              Mark as drafted by others
            </MenuItem>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap-target flex w-full items-center gap-2 px-3 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-700"
    >
      {children}
    </button>
  )
}

export default memo(PlayerRowInner)
