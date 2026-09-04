import { forwardRef, useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { Player } from '../types'
import { searchPlayers, wrapIndex } from '../lib/draft'
import { adpLabel, adpTooltip } from '../lib/adp'
import { BadgeIcons, PositionPill } from './ui'
import TeamLogo from './TeamLogo'
import { useSessionStore } from '../store/session'

interface Props {
  players: Player[]
  leagueSize: number
  /** True when the pick on the clock is mine. */
  myTurn: boolean
  onTap: (playerId: string, forceOpposite?: boolean) => void
}

/**
 * Section 6: the fast path when picks are flying. `/` focuses, Enter marks the top
 * match drafted, Cmd+Enter marks it mine.
 */
const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar(
  { players, leagueSize, myTurn, onTap },
  ref,
) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const results = open ? searchPlayers(players, query, 12) : []
  /** Results shrink as you type, so never trust the stored index unclamped. */
  const active = results.length === 0 ? 0 : Math.min(highlighted, results.length - 1)
  const listRef = useRef<HTMLUListElement>(null)

  // Keep the highlighted row on screen while arrowing through a scrolled list.
  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    item?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  /**
   * The list has to outlive blur long enough for a tap on a result to register,
   * but a quick blur-then-refocus must not close it out from under the user.
   */
  const showLogos = useSessionStore((state) => state.settings.playerImages)
  const closeTimer = useRef<number | undefined>(undefined)
  const cancelClose = () => window.clearTimeout(closeTimer.current)
  useEffect(() => cancelClose, [])

  const commit = (player: Player | undefined, forceOpposite: boolean) => {
    if (!player) return
    onTap(player.id, forceOpposite)
    cancelClose()
    setQuery('')
    setOpen(false)
    setHighlighted(0)
  }

  return (
    <div className="relative min-w-0 flex-1 sm:min-w-64 sm:max-w-md">
      <Search
        size={16}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400"
      />
      <input
        ref={ref}
        value={query}
        placeholder="Search players  ( / )"
        spellCheck={false}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="player-search-results"
        aria-autocomplete="list"
        aria-activedescendant={
          open && results.length > 0 ? `player-search-option-${active}` : undefined
        }
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlighted(0)
        }}
        onFocus={() => {
          cancelClose()
          setOpen(true)
        }}
        onBlur={() => {
          cancelClose()
          closeTimer.current = window.setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            // Stop the caret jumping to the start or end of the query.
            e.preventDefault()
            if (!open) {
              setOpen(true)
              return
            }
            if (results.length === 0) return
            // Functional form: two key events landing in one batch must move two steps.
            const step = e.key === 'ArrowDown' ? 1 : -1
            setHighlighted((prev) => wrapIndex(prev, step, results.length))
          } else if (e.key === 'Home' && open && results.length > 0) {
            e.preventDefault()
            setHighlighted(0)
          } else if (e.key === 'End' && open && results.length > 0) {
            e.preventDefault()
            setHighlighted(results.length - 1)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            commit(results[active], e.metaKey || e.ctrlKey)
          } else if (e.key === 'Escape') {
            setQuery('')
            setOpen(false)
            setHighlighted(0)
            e.currentTarget.blur()
          }
        }}
        className="tap-target w-full rounded-lg border border-stone-300 bg-white pr-8 pl-8 text-sm dark:border-stone-600 dark:bg-stone-800"
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery('')
            setOpen(false)
            setHighlighted(0)
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-1 flex h-9 w-8 -translate-y-1/2 items-center justify-center text-stone-400"
        >
          <X size={16} />
        </button>
      )}

      {open && results.length > 0 && (
        <ul
          ref={listRef}
          id="player-search-results"
          role="listbox"
          /* The list is wider than the input, so it anchors to whichever side has
             room: the input sits left in the wrapped mobile header and right on
             wider screens. */
          className="absolute top-full left-0 z-40 mt-1 max-h-[min(70vh,30rem)] w-104 max-w-[calc(100vw-1.5rem)] min-w-full overflow-y-auto overscroll-contain rounded-lg border border-stone-200 bg-white shadow-xl sm:right-0 sm:left-auto dark:border-stone-700 dark:bg-stone-800"
        >
          {results.map((player, index) => {
            const marked = player.status !== 'available'
            return (
              <li key={player.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  data-index={index}
                  /* mousemove, not mouseenter: a stationary cursor that the list
                     happens to render under must not steal the keyboard's highlight. */
                  onMouseMove={() => {
                    if (active !== index) setHighlighted(index)
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => commit(player, e.metaKey || e.ctrlKey)}
                  title={adpTooltip(player.adp12, player.adpOverall, leagueSize)}
                  className={`tap-target flex w-full items-center gap-2 px-2 text-left ${
                    index === active
                      ? 'bg-emerald-50 ring-1 ring-emerald-400 ring-inset dark:bg-emerald-950/50'
                      : 'hover:bg-stone-100 dark:hover:bg-stone-700'
                  } ${marked ? 'opacity-50' : ''}`}
                >
                  {/* Position · ADP · club · name · badges */}
                  <PositionPill position={player.position} />
                  <span className="w-9 shrink-0 text-right text-[12px] font-semibold tabular-nums text-stone-600 dark:text-stone-300">
                    {adpLabel(player.adpOverall)}
                  </span>
                  <TeamLogo team={player.team} enabled={showLogos} className="h-5 w-6 shrink-0" />
                  <span
                    className={`min-w-0 flex-1 truncate text-sm whitespace-nowrap ${
                      marked ? 'line-through' : ''
                    }`}
                  >
                    {player.name}
                  </span>
                  <BadgeIcons badges={player.badges} size={12} />
                </button>
              </li>
            )
          })}
          <li className="sticky bottom-0 border-t border-stone-200 bg-white px-2 py-1 text-[10px] text-stone-400 dark:border-stone-700 dark:bg-stone-800">
            ↑↓ move · Enter = {myTurn ? 'my pick' : 'drafted'} ·{' '}
            {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter ={' '}
            {myTurn ? 'someone else' : 'mine'}
          </li>
        </ul>
      )}
    </div>
  )
})

export default SearchBar
