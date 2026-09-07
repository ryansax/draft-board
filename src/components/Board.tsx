import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowLeftRight, Flame, LayoutGrid, MonitorPlay, Settings, Undo2, UserPlus, Users, X } from 'lucide-react'
import { useSessionStore } from '../store/session'
import {
  BADGES,
  BADGE_LABELS,
  POSITIONS,
  SKILL_POSITIONS,
  SORT_LABELS,
  type Badge,
  type Player,
  type PlayerStatus,
  type Position,
  type SortMode,
} from '../types'
import {
  bestAvailable,
  currentPick as computeCurrentPick,
  sortPlayers,
  tierKey,
  tierStates,
} from '../lib/draft'
import { isMyTurn } from '../lib/insights'
import { nextPickAtOrAfter } from '../lib/adp'
import { cellForMoment, momentsForSlot } from '../lib/trades'
import { useMediaQuery } from '../lib/useMediaQuery'
import TradeDialog from './TradeDialog'
import PickEditorDialog from './PickEditorDialog'
import PositionColumn from './PositionColumn'
import PickStrip from './PickStrip'
import BestAvailableStrip from './BestAvailableStrip'
import RosterPanel from './RosterPanel'
import RailList from './RailList'
import SearchBar from './SearchBar'
import DraftGrid from './DraftGrid'
import OffBoardDialog from './OffBoardDialog'
import InsightsPanel from './InsightsPanel'
import { BADGE_ICONS, Button, PositionPill } from './ui'

type PositionFilter = Position | 'ALL'
type SidePanel = 'roster' | 'rail'
type View = 'sheet' | 'draft'

export default function Board({
  onExit,
  onOpenSettings,
}: {
  onExit: () => void
  onOpenSettings: () => void
}) {
  const {
    active: session,
    markPlayer,
    tapPlayer,
    undo,
    nudgePickOffset,
    dismissTierAlert,
    setManagerName,
    tradePicks,
    setPickAt,
    undoLastTrade,
    addOffBoardPlayer,
    settings,
    setSettings,
  } = useSessionStore()

  /** Four readable columns need roughly an iPad in landscape. */
  const isWide = useMediaQuery('(min-width: 1024px)')
  /** Enough room to pin the roster panel beside the board. */
  const isExtraWide = useMediaQuery('(min-width: 1280px)')

  const [positionFilter, setPositionFilter] = useState<PositionFilter>('ALL')
  const [badgeFilter, setBadgeFilter] = useState<Badge[]>([])
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [sidePanel, setSidePanel] = useState<SidePanel | null>(null)
  const [view, setView] = useState<View>('sheet')
  const [offBoardOpen, setOffBoardOpen] = useState(false)

  /**
   * Anything landing on my roster gets confirmed out loud. A mis-tap on the ME
   * strip, a drifted pick counter or a stray search Enter would otherwise add a
   * player silently, and a wrong roster quietly poisons the needs and the
   * recommendations. Stays up until dismissed or superseded.
   */
  const [justAddedId, setJustAddedId] = useState<string | null>(null)
  const previousMine = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!session) return
    const mine = new Set(
      session.players.filter((p) => p.status === 'mine').map((p) => p.id),
    )
    const before = previousMine.current
    if (before) {
      const added = [...mine].find((id) => !before.has(id))
      if (added) setJustAddedId(added)
    }
    previousMine.current = mine
  }, [session])
  const searchRef = useRef<HTMLInputElement>(null)

  /**
   * Pin the roster panel when there is room for it beside the board; on smaller
   * screens it is an overlay, so it should not be left covering the columns.
   */
  useEffect(() => {
    setSidePanel((current) => (isExtraWide ? (current ?? 'roster') : null))
  }, [isExtraWide])

  const onMark = useCallback(
    (playerId: string, status: PlayerStatus) => {
      markPlayer(playerId, status)
      setOpenMenu(null)
    },
    [markPlayer],
  )

  const correctRoster = useCallback(
    (playerId: string, status: PlayerStatus) => {
      markPlayer(playerId, status)
      setJustAddedId((current) => (current === playerId ? null : current))
    },
    [markPlayer],
  )

  /** A plain tap; the store decides whose pick it is from live state. */
  const onTap = useCallback(
    (playerId: string, forceOpposite = false) => {
      tapPlayer(playerId, forceOpposite)
      setOpenMenu(null)
    },
    [tapPlayer],
  )

  const onToggleMenu = useCallback((playerId: string | null) => setOpenMenu(playerId), [])

  // Global shortcuts: `/` to search, Cmd+Z to undo.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      } else if (e.key === 'Escape') {
        setOpenMenu(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo])

  const [trading, setTrading] = useState(false)
  const [editingCell, setEditingCell] = useState<number | null>(null)

  const derived = useMemo(() => {
    if (!session) return null
    // `pick` is the moment — how many selections deep the draft is. Without
    // trades it is also the cell on the clock; with them the two diverge.
    const pick = computeCurrentPick(session.players, session.pickOffset)
    const cell = cellForMoment(pick, session.trades)
    const picks = momentsForSlot(session, session.draftSlot)
    const next = nextPickAtOrAfter(picks, pick)
    return {
      pick,
      cell,
      picks,
      next,
      myTurn: isMyTurn(cell, session.leagueSize, session.draftSlot),
      upcoming: picks.filter((p) => p >= pick).slice(0, 6),
      tiers: tierStates(session.players),
      best: bestAvailable(session.players, 5, [...SKILL_POSITIONS]),
    }
  }, [session])

  const visible = useMemo(() => {
    if (!session) return new Map<Position, Player[]>()
    const map = new Map<Position, Player[]>()
    for (const position of POSITIONS) {
      const inColumn = session.players.filter(
        (p) =>
          p.position === position &&
          !(settings.hideDrafted && p.status !== 'available') &&
          (badgeFilter.length === 0 || badgeFilter.some((b) => p.badges.includes(b))),
      )
      map.set(position, sortPlayers(inColumn, settings.sortMode))
    }
    return map
  }, [session, settings.hideDrafted, settings.sortMode, badgeFilter])

  const jumpToPlayer = useCallback(
    (playerId: string) => {
      const position = playerId.split('-')[0] as Position
      if (positionFilter !== 'ALL' && positionFilter !== position) setPositionFilter(position)
      window.setTimeout(() => {
        document.getElementById(`row-${playerId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }, 50)
    },
    [positionFilter],
  )

  if (!session || !derived) return null

  /**
   * Narrow screens show one position at a time. Derived rather than stored, so
   * rotating an iPad back to landscape restores all four columns.
   */
  const columns: Position[] =
    positionFilter !== 'ALL' ? [positionFilter] : isWide ? [...SKILL_POSITIONS] : ['RB']

  const justAdded: Player | null =
    (justAddedId && session.players.find((p) => p.id === justAddedId && p.status === 'mine')) || null

  // Section 7.5: a tier run is worth interrupting for.
  const tierAlerts = [...derived.tiers.values()]
    .filter((t) => t.scarce && t.remaining < t.total && !session.dismissedTierAlerts.includes(tierKey(t.position, t.tier)))
    .slice(0, 3)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header
        className={`z-30 shrink-0 border-b px-2 py-2 ${
          derived.myTurn
            ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/50'
            : 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={onExit} aria-label="Back to drafts" className="!px-2">
            <ArrowLeft size={18} />
          </Button>
          <div className="hidden min-w-0 lg:block">
            <div className="truncate text-sm font-semibold">{session.name}</div>
          </div>

          <div className="flex rounded-lg bg-stone-200 p-0.5 dark:bg-stone-800">
            {(
              [
                ['sheet', 'Sheet', null],
                ['draft', 'Draft board', LayoutGrid],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`tap-target flex items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors ${
                  view === key
                    ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-950 dark:text-stone-100'
                    : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                {Icon && <Icon size={15} />}
                {label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <SearchBar
              ref={searchRef}
              players={session.players}
              leagueSize={session.leagueSize}
              myTurn={derived.myTurn}
              onTap={onTap}
            />
            <Button
              variant="ghost"
              onClick={() => setOffBoardOpen(true)}
              title="Log a player who is not on the cheat sheet"
              aria-label="Off-the-board selection"
              className="!px-2"
            >
              <UserPlus size={18} />
            </Button>
            <Button
              variant="ghost"
              onClick={undo}
              disabled={session.undoStack.length === 0}
              title="Undo (Cmd+Z)"
              aria-label="Undo last pick"
              className="!px-2"
            >
              <Undo2 size={18} />
            </Button>
            <Button
              variant={sidePanel === 'roster' ? 'primary' : 'ghost'}
              onClick={() => setSidePanel((p) => (p === 'roster' ? null : 'roster'))}
              aria-label="My roster"
              className="!px-2"
            >
              <Users size={18} />
            </Button>
            <Button
              variant={sidePanel === 'rail' ? 'primary' : 'ghost'}
              onClick={() => setSidePanel((p) => (p === 'rail' ? null : 'rail'))}
              title="Defenses and kickers"
              className="!px-2 text-xs font-bold"
            >
              D/K
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                window.open(
                  `${window.location.pathname}#/present/${encodeURIComponent(session.id)}`,
                  'draft-board-presentation',
                  'noopener',
                )
              }
              title="Open the big-screen board in a new window"
              aria-label="Open the board on a second screen"
              className="!px-2"
            >
              <MonitorPlay size={18} />
            </Button>
            <Button variant="ghost" onClick={onOpenSettings} aria-label="Settings" className="!px-2">
              <Settings size={18} />
            </Button>
          </div>
        </div>

        <div className="mt-2">
          <PickStrip
            currentPick={derived.pick}
            upcoming={derived.upcoming}
            myNextPick={derived.next}
            leagueSize={session.leagueSize}
            draftSlot={session.draftSlot}
            onNudge={nudgePickOffset}
          />
        </div>

        {/* Filters — sheet view only */}
        <div className={`mt-2 flex-wrap items-center gap-1.5 ${view === 'sheet' ? 'flex' : 'hidden'}`}>
          {(['ALL', ...POSITIONS] as PositionFilter[])
            .filter((p) => isWide || p !== 'ALL')
            .map((option) => (
              <button
                key={option}
                onClick={() => setPositionFilter(option)}
                className={`tap-target rounded-lg px-3 text-sm font-semibold transition-colors ${
                  positionFilter === option
                    ? 'bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900'
                    : 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200'
                }`}
              >
                {option === 'ALL' ? 'All' : option}
              </button>
            ))}

          <span className="mx-1 h-6 w-px bg-stone-300 dark:bg-stone-700" />

          {BADGES.map((badge) => {
            const Icon = BADGE_ICONS[badge]
            const on = badgeFilter.includes(badge)
            return (
              <button
                key={badge}
                onClick={() =>
                  setBadgeFilter((list) => (on ? list.filter((b) => b !== badge) : [...list, badge]))
                }
                aria-pressed={on}
                title={`Only ${BADGE_LABELS[badge]}`}
                className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
                  on
                    ? 'bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900'
                    : 'bg-stone-200 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
                }`}
              >
                <Icon size={16} strokeWidth={2.25} />
              </button>
            )
          })}
          {badgeFilter.length > 0 && (
            <Button variant="ghost" onClick={() => setBadgeFilter([])} className="!px-2 text-xs">
              Clear
            </Button>
          )}

          <label className="ml-auto flex items-center gap-1.5 text-sm">
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">Sort</span>
            <select
              value={settings.sortMode}
              onChange={(e) => setSettings({ sortMode: e.target.value as SortMode })}
              title="Sorting by ADP or upside puts the tier bands away"
              className="tap-target rounded-lg border border-stone-300 bg-white px-2 text-sm font-medium dark:border-stone-600 dark:bg-stone-800"
            >
              {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {SORT_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex cursor-pointer items-center gap-2 pr-1 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-emerald-600"
              checked={settings.hideDrafted}
              onChange={(e) => setSettings({ hideDrafted: e.target.checked })}
            />
            Hide drafted
          </label>
        </div>
      </header>

      {view === 'sheet' && (
        <div className="shrink-0 border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-950">
          <BestAvailableStrip
            players={derived.best}
            leagueSize={session.leagueSize}
            onPick={jumpToPlayer}
          />
        </div>
      )}

      {/* Board */}
      <div className="flex min-h-0 flex-1">
        {view === 'sheet' ? (
          <main className="flex min-h-0 min-w-0 flex-1 gap-2 p-2">
            {columns.map((position) => (
              <PositionColumn
                key={position}
                position={position}
                players={visible.get(position) ?? []}
                tiers={derived.tiers}
                leagueSize={session.leagueSize}
                currentPick={derived.pick}
                trades={session.trades}
                myNextPick={derived.next}
                openMenu={openMenu}
                showTiers={settings.sortMode === 'rank'}
                myTurn={derived.myTurn}
                onMark={onMark}
                onTap={onTap}
                onToggleMenu={onToggleMenu}
              />
            ))}
          </main>
        ) : (
          <main className="flex min-h-0 min-w-0 flex-1 flex-col xl:flex-row">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-2 px-2 pt-2">
                <Button
                  onClick={() =>
                    window.open(
                      `${window.location.pathname}#/present/${encodeURIComponent(session.id)}`,
                      'draft-board-presentation',
                      'noopener',
                    )
                  }
                  className="px-3"
                >
                  <MonitorPlay size={16} /> Second screen
                </Button>
                <Button onClick={() => setTrading(true)} className="px-3">
                  <ArrowLeftRight size={16} /> Trade picks
                </Button>
                <span className="text-xs text-stone-500 dark:text-stone-400">
                  {session.trades.length > 0
                    ? `${session.trades.length} pick ${session.trades.length === 1 ? 'swap' : 'swaps'} in effect.`
                    : 'Opens a read-only board for the room. It follows your picks live.'}
                </span>
              </div>
              {trading && (
                <TradeDialog
                  session={session}
                  moment={derived.pick}
                  onTrade={tradePicks}
                  onUndoTrade={undoLastTrade}
                  onClose={() => setTrading(false)}
                />
              )}
              {editingCell !== null && (
                <PickEditorDialog
                  session={session}
                  cell={editingCell}
                  onSet={setPickAt}
                  onClose={() => setEditingCell(null)}
                />
              )}
              <DraftGrid
                session={session}
                clockCell={derived.cell}
                onEditPick={setEditingCell}
                onRenameManager={setManagerName}
              />
            </div>
            <aside className="column-scroll min-h-0 w-full shrink-0 overflow-y-auto border-t border-stone-200 bg-white xl:w-96 xl:border-t-0 xl:border-l dark:border-stone-700 dark:bg-stone-900">
              <InsightsPanel
                session={session}
                currentPick={derived.pick}
                myNextPick={derived.next}
                onMark={onMark}
              />
            </aside>
          </main>
        )}

        {sidePanel && (
          <>
            {!isExtraWide && (
              <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSidePanel(null)} />
            )}
            <aside
              className={`flex min-h-0 flex-col border-l border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900 ${
                isExtraWide ? 'w-80 shrink-0' : 'fixed inset-y-0 right-0 z-50 w-80 shadow-2xl'
              }`}
            >
              {!isExtraWide && (
                <button
                  onClick={() => setSidePanel(null)}
                  aria-label="Close panel"
                  className="tap-target absolute top-2 right-2 z-10 flex w-11 items-center justify-center text-stone-400"
                >
                  <X size={18} />
                </button>
              )}
              {sidePanel === 'roster' ? (
                <RosterPanel session={session} onCorrect={correctRoster} />
              ) : (
                <div className="flex min-h-0 flex-col">
                  <h2 className="shrink-0 px-3 py-2 text-sm font-bold">Defenses &amp; Kickers</h2>
                  <div className="column-scroll min-h-0 flex-1 overflow-y-auto px-1 pb-4">
                    {(['DST', 'K'] as Position[]).map((position) => {
                      const list = session.players.filter(
                        (p) =>
                          p.position === position && !(settings.hideDrafted && p.status !== 'available'),
                      )
                      return (
                        <div key={position} className="mb-3">
                          <div className="sticky top-0 z-10 flex items-center gap-2 bg-white px-2 py-1 dark:bg-stone-900">
                            <PositionPill position={position} />
                            <span className="text-[11px] text-stone-500 dark:text-stone-400">
                              {list.filter((p) => p.status === 'available').length} left
                            </span>
                          </div>
                          <RailList
                            position={position}
                            players={list}
                            myTurn={derived.myTurn}
                            onMark={onMark}
                            onTap={onTap}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </aside>
          </>
        )}
      </div>

      {offBoardOpen && (
        <OffBoardDialog onAdd={addOffBoardPlayer} onClose={() => setOffBoardOpen(false)} />
      )}

      {/* Confirmation of anything added to my roster */}
      {justAdded && (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center px-3">
          <div className="pointer-events-auto flex max-w-lg items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-600 py-2 pr-1 pl-3 text-sm text-white shadow-xl">
            <Users size={16} className="shrink-0" />
            <span className="min-w-0">
              Added to <strong>your roster</strong>: {justAdded.name}
              {justAdded.draftedAtPick !== null && (
                <span className="opacity-80"> at pick {justAdded.draftedAtPick}</span>
              )}
            </span>
            <Button
              variant="ghost"
              className="!min-h-9 shrink-0 border border-white/40 !px-2 text-xs !text-white hover:bg-white/20"
              onClick={() => correctRoster(justAdded.id, 'drafted')}
            >
              Not mine
            </Button>
            <button
              onClick={() => setJustAddedId(null)}
              aria-label="Dismiss"
              className="tap-target flex w-11 shrink-0 items-center justify-center rounded hover:bg-white/20"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Tier-run toasts */}
      {tierAlerts.length > 0 && (
        <div className="pointer-events-none fixed bottom-3 left-3 z-50 flex flex-col gap-2">
          {tierAlerts.map((tier) => (
            <div
              key={tierKey(tier.position, tier.tier)}
              className="pointer-events-auto flex items-center gap-2 rounded-lg bg-orange-600 py-2 pr-1 pl-3 text-sm font-semibold text-white shadow-lg"
            >
              <Flame size={16} />
              <span>
                {tier.position} Tier {tier.tier} is almost empty — {tier.remaining} left
              </span>
              <button
                onClick={() => dismissTierAlert(tierKey(tier.position, tier.tier))}
                aria-label="Dismiss"
                className="tap-target flex w-11 items-center justify-center rounded hover:bg-white/20"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
