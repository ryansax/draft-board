import type { Player } from '../types'
import type { HeadshotLookup } from '../lib/headshots'
import { splitName } from '../lib/draft'
import PlayerFace from './PlayerFace'
import { POSITION_COLORS } from './ui'

/**
 * One made pick, laid out like a FantasyPros selection card: given name over
 * surname at the top left, pick number top right, position-team bottom left, and
 * the headshot filling the right edge.
 *
 * Everything sizes in `em`, so the parent sets one font-size and the whole card
 * scales — that is what lets the room display and the in-app grid share it.
 */
export default function DraftCard({
  player,
  pickLabel,
  faces,
  isMine = false,
  flagged = false,
  title,
}: {
  player: Player
  /** `1.01` on the room display, `1` in the control window. */
  pickLabel: string
  faces: HeadshotLookup | null
  isMine?: boolean
  /** This pick sits in my column but is not on my roster. */
  flagged?: boolean
  title?: string
}) {
  const [first, last] = splitName(player.name)

  return (
    <div
      title={title}
      className={`relative h-full overflow-hidden rounded-lg text-white ${
        POSITION_COLORS[player.position]
      } ${
        flagged
          ? 'outline-2 outline-dashed outline-amber-400'
          : isMine
            ? 'ring-2 ring-emerald-900 dark:ring-emerald-200'
            : ''
      }`}
    >
      {/*
        Sleeper headshots are 350x254 with the head centred and dead space either
        side. Sizing by height and shifting right crops that away, so the head sits
        almost against the card edge rather than floating in a photo box.
      */}
      <PlayerFace
        player={player}
        lookup={faces}
        className="absolute right-0 bottom-0 h-[74%] w-auto max-w-none translate-x-[20%]"
      />

      <div className="relative flex h-full flex-col justify-between p-[0.4em]">
        <div className="flex items-start justify-between gap-[0.3em]">
          {/*
            One size for both lines. A long name truncates on its own line rather
            than wrapping, which is what stopped "Christian McCaffrey" breaking
            mid-word.
          */}
          <div className="min-w-0 max-w-[60%] leading-[1.15] font-bold">
            {first && <div className="truncate">{first}</div>}
            <div className="truncate">{last}</div>
          </div>
          <div className="shrink-0 text-[0.92em] font-bold tabular-nums opacity-90">{pickLabel}</div>
        </div>

        <div className="flex items-baseline gap-[0.3em] text-[0.8em] font-bold tracking-wide uppercase opacity-85">
          <span className="truncate">
            {player.position}-{player.team}
          </span>
          {flagged && <span className="font-black text-amber-200">!</span>}
        </div>
      </div>
    </div>
  )
}
