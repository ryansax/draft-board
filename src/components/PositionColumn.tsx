import { Fragment } from 'react'
import type { Player, PlayerStatus, Position } from '../types'
import type { PickTrade } from '../lib/trades'
import type { TierState } from '../lib/draft'
import { tierKey } from '../lib/draft'
import PlayerRow from './PlayerRow'
import RailList from './RailList'
import { POSITION_COLORS } from './ui'

interface Props {
  position: Position
  players: Player[]
  tiers: Map<string, TierState>
  leagueSize: number
  trades: PickTrade[]
  currentPick: number
  myNextPick: number | null
  openMenu: string | null
  /** Tier bands only make sense while the column is in sheet order. */
  showTiers: boolean
  myTurn: boolean
  onMark: (playerId: string, status: PlayerStatus) => void
  onTap: (playerId: string, forceOpposite?: boolean) => void
  onToggleMenu: (playerId: string | null) => void
}

const POSITION_TITLES: Record<Position, string> = {
  QB: 'Quarterbacks',
  RB: 'Running Backs',
  WR: 'Wide Receivers',
  TE: 'Tight Ends',
  DST: 'Defenses',
  K: 'Kickers',
}

export default function PositionColumn({
  position,
  players,
  tiers,
  leagueSize,
  trades,
  currentPick,
  myNextPick,
  openMenu,
  showTiers,
  myTurn,
  onMark,
  onTap,
  onToggleMenu,
}: Props) {
  const remaining = players.filter((p) => p.status === 'available').length
  /** Defenses and kickers are plain numbered lists — no tiers, ADP, risk or upside. */
  const isRail = position === 'DST' || position === 'K'

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      <header
        className={`flex shrink-0 items-baseline gap-2 rounded-t-xl px-3 py-2 text-white ${POSITION_COLORS[position]}`}
      >
        <h2 className="text-sm font-bold tracking-tight">{POSITION_TITLES[position]}</h2>
        <span className="ml-auto text-[11px] font-semibold tabular-nums opacity-90">{remaining} left</span>
      </header>

      <div className="column-scroll min-h-0 flex-1 overflow-y-auto">
        {players.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-stone-400">Nothing left here.</p>
        ) : isRail ? (
          <RailList position={position} players={players} myTurn={myTurn} onMark={onMark} onTap={onTap} />
        ) : (
          players.map((player, index) => {
            const prev = index > 0 ? players[index - 1] : null
            const showTier = showTiers && player.tier !== null && player.tier !== prev?.tier
            const tier = showTier ? tiers.get(tierKey(position, player.tier!)) : undefined
            return (
              <Fragment key={player.id}>
                {showTier && tier && <TierBand tier={tier} />}
                <PlayerRow
                  player={player}
                  leagueSize={leagueSize}
                  currentPick={currentPick}
                  trades={trades}
                  myNextPick={myNextPick}
                  menuOpen={openMenu === player.id}
                  myTurn={myTurn}
                  onMark={onMark}
                  onTap={onTap}
                  onToggleMenu={onToggleMenu}
                />
              </Fragment>
            )
          })
        )}
      </div>
    </section>
  )
}

/** The green bars from the printed sheet, plus how much of the tier is left. */
function TierBand({ tier }: { tier: TierState }) {
  return (
    <div
      className={`sticky top-0 z-20 flex items-center gap-2 border-y px-3 py-1 text-[11px] font-bold tracking-wide ${
        tier.scarce
          ? 'border-orange-300 bg-orange-200 text-orange-900 dark:border-orange-700 dark:bg-orange-900 dark:text-orange-100'
          : 'border-emerald-300 bg-emerald-200 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-100'
      }`}
    >
      <span>TIER {tier.tier}</span>
      <span className="ml-auto font-semibold tabular-nums opacity-80">
        {tier.remaining} of {tier.total} left
      </span>
    </div>
  )
}
