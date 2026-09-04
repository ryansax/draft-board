import { Lightbulb, Target } from 'lucide-react'
import type { PlayerStatus, Session } from '../types'
import { pressureBeforeMyPick, recommendPicks } from '../lib/insights'
import { adpLabel, adpTooltip } from '../lib/adp'
import { BadgeIcons, Button, Chip, PositionPill } from './ui'

interface Props {
  session: Session
  currentPick: number
  myNextPick: number | null
  onMark: (playerId: string, status: PlayerStatus) => void
}

/**
 * What the app thinks I should do next, and why. Everything here is derived from
 * the sheet plus what has already come off the board.
 */
export default function InsightsPanel({ session, currentPick, myNextPick, onMark }: Props) {
  const onTheClock = myNextPick !== null && myNextPick <= currentPick
  const recommendations = recommendPicks(session, currentPick, myNextPick, 5)
  const pressure = pressureBeforeMyPick(session, currentPick, myNextPick).slice(0, 4)
  const away = myNextPick === null ? null : myNextPick - currentPick

  return (
    <div className="flex min-h-0 flex-col gap-3 p-3">
      <section>
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <Target size={15} />
          {onTheClock ? 'Take one of these' : `Your board at pick ${myNextPick ?? '—'}`}
        </h2>
        <p className="mb-2 text-[11px] text-stone-500 dark:text-stone-400">
          Ranked on ADP value at your pick, the holes left on your roster, tier scarcity and
          whether he survives until your following pick.
        </p>

        {recommendations.length === 0 ? (
          <p className="text-xs text-stone-400">Nothing left to recommend.</p>
        ) : (
          <ol className="space-y-1.5">
            {recommendations.map((rec, index) => {
              return (
                <li
                  key={rec.player.id}
                  className={`rounded-lg border p-2 ${
                    index === 0
                      ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40'
                      : 'border-stone-200 dark:border-stone-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 text-[11px] font-bold text-stone-400">{index + 1}</span>
                    <PositionPill position={rec.player.position} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {rec.player.name}
                    </span>
                    <BadgeIcons badges={rec.player.badges} size={12} />
                    <span
                      className="text-[11px] tabular-nums text-stone-500 dark:text-stone-400"
                      title={adpTooltip(rec.player.adp12, rec.player.adpOverall, session.leagueSize)}
                    >
                      {adpLabel(rec.player.adpOverall)}
                    </span>
                  </div>
                  {rec.reasons.length > 0 && (
                    <ul className="mt-1 ml-6 space-y-0.5">
                      {rec.reasons.map((reason) => (
                        <li key={reason} className="text-[11px] text-stone-600 dark:text-stone-300">
                          · {reason}
                        </li>
                      ))}
                    </ul>
                  )}
                  {onTheClock && (
                    <div className="mt-1.5 ml-6 flex gap-1.5">
                      <Button
                        variant="primary"
                        className="!min-h-9 px-2 text-xs"
                        onClick={() => onMark(rec.player.id, 'mine')}
                      >
                        Draft him
                      </Button>
                      <Button
                        className="!min-h-9 px-2 text-xs"
                        onClick={() => onMark(rec.player.id, 'drafted')}
                      >
                        Someone took him
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {pressure.length > 0 && away !== null && (
        <section>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold">
            <Lightbulb size={15} />
            Before your turn
          </h2>
          <p className="mb-2 text-[11px] text-stone-500 dark:text-stone-400">
            {away} {away === 1 ? 'pick' : 'picks'} between now and yours. What those managers
            still need to start:
          </p>
          <ul className="space-y-1">
            {pressure.map((row) => (
              <li key={row.position} className="flex items-center gap-2 text-[12px]">
                <PositionPill position={row.position} />
                <span className="flex-1">
                  {row.managersNeeding} {row.managersNeeding === 1 ? 'manager needs' : 'managers need'} one
                </span>
                {row.likelyGone > 0 && (
                  <Chip tone={row.likelyGone <= 2 ? 'gone' : 'coinflip'}>
                    {row.likelyGone} due to go
                  </Chip>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
