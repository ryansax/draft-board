import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minimize } from 'lucide-react'
import type { Player, Session } from '../types'
import { getSession } from '../lib/db'
import { subscribeToSessions } from '../lib/broadcast'
import { currentPick as computeCurrentPick, draftRounds } from '../lib/draft'
import { overallToRoundPick } from '../lib/adp'
import { buildDraftGrid, roundForPick, slotForPick, type GridCell } from '../lib/insights'
import { usePlayerImages, useSquadFacts } from '../lib/usePlayerImages'
import { cellForMoment, momentForCell, slotAtMoment, type PickTrade } from '../lib/trades'
import TradeBadge from './TradeBadge'
import TradeAlert, { type TradeAlertRequest } from './TradeAlert'
import { speakLine } from '../lib/speech'
import { loadSettings, saveSettings } from '../lib/db'
import type { HeadshotLookup } from '../lib/headshots'
import DraftCard from './DraftCard'
import PickAnnouncement, { type AnnouncementRequest } from './PickAnnouncement'
import { Volume2, VolumeX } from 'lucide-react'
import { audioBlocked, unlockAudio } from '../lib/sting'

/** Re-read from IndexedDB this often, in case a broadcast was missed. */
const RESYNC_MS = 4000

/**
 * A read-only board for a second screen, sized to be read across a room. It owns
 * its own data rather than going through the store: it is a separate window, and
 * it should keep working regardless of what the control window is doing.
 *
 * Deliberately impersonal: this screen is for the room, so the owner's team gets no
 * highlighted column, no ringed picks and no coloured on-the-clock banner. Those
 * cues belong in the control window, where they are the point.
 */
export default function PresentationBoard({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const [missing, setMissing] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const found = await getSession(sessionId)
      if (cancelled) return
      if (found) setSession(found)
      else setMissing(true)
    }
    void load()

    // Instant updates from the control window...
    const unsubscribe = subscribeToSessions((incoming) => {
      if (incoming.id === sessionId) {
        setSession(incoming)
        setMissing(false)
      }
    })
    // ...plus a slow re-read, so a dropped message cannot strand the room display.
    const timer = window.setInterval(() => void load(), RESYNC_MS)

    return () => {
      cancelled = true
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [sessionId])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  if (missing && !session) {
    return (
      <div className="flex h-full items-center justify-center bg-white p-8 text-center text-stone-700">
        <div>
          <h1 className="text-3xl font-bold">Draft not found</h1>
          <p className="mt-2 text-stone-500">
            Open this window from the draft you want to show, using “Second screen”.
          </p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-2xl text-stone-500">
        Loading the board…
      </div>
    )
  }

  return <Display session={session} fullscreen={fullscreen} onToggleFullscreen={() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => {})
  }} />
}

function Display({
  session,
  fullscreen,
  onToggleFullscreen,
}: {
  session: Session
  fullscreen: boolean
  onToggleFullscreen: () => void
}) {
  const pick = computeCurrentPick(session.players, session.pickOffset)
  // The cell on the clock; the same number until picks are traded.
  const clockCell = cellForMoment(pick, session.trades)
  const rounds = draftRounds(session.rosterConfig)
  const grid = useMemo(() => buildDraftGrid(session), [session])
  // Which cell the room is watching, and therefore which manager and which round.
  const round = Math.min(roundForPick(clockCell, session.leagueSize), rounds)
  const onClockSlot = slotForPick(clockCell, session.leagueSize)
  const onClockName = session.managers[onClockSlot - 1] ?? `Team ${onClockSlot}`

  const currentRow = useRef<HTMLDivElement>(null)
  useEffect(() => {
    currentRow.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [round])

  const totalPicks = rounds * session.leagueSize
  const made = session.players.filter((p) => p.draftedAtPick !== null).length
  const settings = loadSettings()
  const faces = usePlayerImages(settings.playerImages)
  // The analyst needs current rosters whether or not faces are switched on.
  const squad = useSquadFacts(settings.pickAnalysis && Boolean(settings.anthropicApiKey))
  const [funMode, setFunMode] = useState(settings.funMode)
  const [soundReady, setSoundReady] = useState(false)

  /** Browsers need a gesture before audio is allowed; any click on the board counts. */
  useEffect(() => {
    const unlock = () => {
      void unlockAudio().then((ok) => ok && setSoundReady(true))
    }
    unlock()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  /**
   * Watch for a newly logged pick and queue its announcement. Comparing against the
   * previous render means the very first load never announces a backlog.
   */
  const [queued, setQueued] = useState<AnnouncementRequest | null>(null)
  const seenPicks = useRef<Set<number> | null>(null)

  /*
   * The same trick for trades: remember which agreements have been seen, so a
   * board opened mid-draft shows the board rather than replaying every trade.
   */
  const [tradeAlert, setTradeAlert] = useState<TradeAlertRequest | null>(null)
  const seenTrades = useRef<Set<number> | null>(null)

  useEffect(() => {
    const groups = new Set(session.trades.map((t, i) => t.group ?? i + 1))
    const before = seenTrades.current
    seenTrades.current = groups
    if (!before) return
    const fresh = [...groups].filter((g) => !before.has(g)).sort((a, b) => a - b).pop()
    if (fresh === undefined) return
    setTradeAlert({ group: fresh, session })
  }, [session])

  useEffect(() => {
    const picks = new Set(
      session.players.filter((p) => p.draftedAtPick !== null).map((p) => p.draftedAtPick as number),
    )
    const before = seenPicks.current
    seenPicks.current = picks
    if (!before || !funMode) return

    const fresh = [...picks].filter((p) => !before.has(p)).sort((a, b) => a - b).pop()
    if (fresh === undefined) return

    const player = session.players.find((p) => p.draftedAtPick === fresh)
    if (!player) return

    const slot = slotForPick(fresh, session.leagueSize)
    // Who is up next is a question about the order, not the board: after a trade
    // the following selection may belong to a completely different column.
    const nextMoment = momentForCell(fresh, session.trades) + 1
    const nextSlot = slotAtMoment(nextMoment, session)
    setQueued({
      player,
      managerName: session.managers[slot - 1] ?? `Team ${slot}`,
      round: roundForPick(fresh, session.leagueSize),
      pickInRound: fresh - (roundForPick(fresh, session.leagueSize) - 1) * session.leagueSize,
      overallPick: fresh,
      session,
      nextManagerName:
        nextMoment <= rounds * session.leagueSize
          ? (session.managers[nextSlot - 1] ?? `Team ${nextSlot}`)
          : null,
    })
  }, [session, funMode, rounds])

  return (
    <div className="presentation-root flex h-full flex-col overflow-hidden bg-white text-stone-900">
      {/* Who is on the clock — the thing the room actually wants to know */}
      <header className="flex shrink-0 items-center gap-[2vw] border-b border-stone-200 px-[2vw] py-[1.4vh]">
        <div className="min-w-0">
          <div className="truncate text-[clamp(0.9rem,1.4vw,1.6rem)] font-semibold text-stone-600">
            {session.name}
          </div>
          <div className="text-[clamp(0.7rem,1vw,1.1rem)] text-stone-500 tabular-nums">
            Round {round} of {rounds} · {made} of {totalPicks} picks
          </div>
        </div>

        {/* Everyone is on the clock the same way here — see the note on neutrality. */}
        <div className="ml-auto flex items-baseline gap-[1.5vw] rounded-2xl bg-stone-900 px-[2vw] py-[1vh] text-white">
          <span className="text-[clamp(0.7rem,1vw,1.1rem)] font-semibold tracking-widest uppercase opacity-80">
            On the clock
          </span>
          <span className="text-[clamp(1.6rem,4vw,4.5rem)] leading-none font-black tracking-tight">
            {onClockName}
          </span>
          <span className="text-[clamp(0.9rem,1.6vw,2rem)] leading-none font-bold text-stone-300 tabular-nums">
            {/* The cell being filled, which after a trade is not the moment count. */}
            {overallToRoundPick(clockCell, session.leagueSize).label}
          </span>
        </div>

        <button
          onClick={() => {
            const next = !funMode
            setFunMode(next)
            saveSettings({ ...loadSettings(), funMode: next })
            // This click is the gesture that lets the sting make noise.
            void unlockAudio().then((ok) => setSoundReady(ok))
          }}
          title={funMode ? 'Fun mode is on — picks are announced' : 'Turn on spoken pick announcements'}
          aria-label="Toggle fun mode"
          aria-pressed={funMode}
          className={`shrink-0 rounded-xl p-[0.8vw] ${
            funMode
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-900'
          }`}
        >
          {funMode ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>

        {funMode && !soundReady && audioBlocked() && (
          <span className="shrink-0 rounded-lg bg-amber-100 px-[0.8vw] py-[0.6vh] text-[clamp(0.55rem,0.75vw,0.9rem)] font-semibold text-amber-900">
            Click anywhere to enable sound
          </span>
        )}

        <button
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? 'Exit full screen' : 'Go full screen'}
          className="shrink-0 rounded-xl bg-stone-100 p-[0.8vw] text-stone-500 hover:bg-stone-200 hover:text-stone-900"
        >
          {fullscreen ? <Maximize size={20} /> : <Minimize size={20} />}
        </button>
      </header>

      {tradeAlert && (
        <TradeAlert
          request={tradeAlert}
          sound={funMode && soundReady}
          speak={
            funMode && settings.elevenLabsApiKey.trim()
              ? (text) =>
                  speakLine(
                    text,
                    settings.elevenLabsApiKey,
                    settings.elevenLabsVoiceId,
                  )
              : null
          }
          onFinished={() => setTradeAlert(null)}
        />
      )}

      {queued && (
        <PickAnnouncement
          request={queued}
          faces={faces}
          squad={squad}
          apiKey={settings.elevenLabsApiKey}
          voiceId={settings.elevenLabsVoiceId}
          analystVoiceId={settings.elevenLabsAnalystVoiceId}
          analysisKey={settings.pickAnalysis ? settings.anthropicApiKey : ''}
          onFinished={() => setQueued(null)}
        />
      )}

      {/* The board */}
      <div className="min-h-0 flex-1 overflow-y-auto px-[1vw] py-[1vh]">
        <div
          className="grid gap-[0.35vw]"
          style={{ gridTemplateColumns: `2.6vw repeat(${session.leagueSize}, minmax(0, 1fr))` }}
        >
          {/* Manager names */}
          <div className="sticky top-0 z-10 bg-white" />
          {Array.from({ length: session.leagueSize }, (_, i) => i + 1).map((slot) => (
            <div
              key={slot}
              /* Fantasy team names run long; keep them small enough to survive. */
              className="sticky top-0 z-10 truncate rounded-t-lg bg-stone-200 px-[0.4vw] py-[0.6vh] text-center text-[clamp(0.5rem,0.72vw,0.95rem)] font-bold text-stone-700"
            >
              {session.managers[slot - 1] ?? `Team ${slot}`}
            </div>
          ))}

          {grid.map((row) => {
            const isCurrentRound = row[0].round === round
            return (
              <Row
                key={row[0].round}
                row={row}
                clockCell={clockCell}
                trades={session.trades}
                faces={faces}
                leagueSize={session.leagueSize}
                isCurrentRound={isCurrentRound}
                rowRef={isCurrentRound ? currentRow : undefined}
              />
            )
          })}
        </div>
      </div>

    </div>
  )
}

function Row({
  row,
  faces,
  leagueSize,
  isCurrentRound,
  rowRef,
  clockCell,
  trades,
}: {
  row: GridCell[]
  clockCell: number
  faces: HeadshotLookup | null
  leagueSize: number
  trades: PickTrade[]
  isCurrentRound: boolean
  rowRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <>
      <div
        ref={rowRef}
        className={`flex items-center justify-center rounded-l-lg text-[clamp(0.7rem,1.1vw,1.4rem)] font-black tabular-nums ${
          isCurrentRound ? 'bg-stone-900 text-white' : 'text-stone-400'
        }`}
      >
        {row[0].round}
      </div>
      {row.map((cell) => (
        <Cell
          key={cell.pick}
          cell={cell}
          clockCell={clockCell}
          faces={faces}
          leagueSize={leagueSize}
          trades={trades}
        />
      ))}
    </>
  )
}

function Cell({
  cell,
  clockCell,
  faces,
  leagueSize,
  trades,
}: {
  cell: GridCell
  /** The cell about to be filled — not the moment count, once picks are traded. */
  clockCell: number
  faces: HeadshotLookup | null
  leagueSize: number
  trades: PickTrade[]
}) {
  const onTheClock = cell.pick === clockCell
  const player: Player | null = cell.player
  /** This board labels picks as round.pick; the control window keeps whole numbers. */
  const label = overallToRoundPick(cell.pick, leagueSize).label

  if (!player) {
    return (
      <div
        className={`flex min-h-[7.6vh] items-center justify-center rounded-lg tabular-nums ${
          onTheClock
            ? 'bg-amber-400 text-[clamp(0.9rem,1.9vw,2.4rem)] font-black text-amber-950'
            : 'bg-stone-100 text-[clamp(0.6rem,0.85vw,1rem)] text-stone-400'
        }`}
      >
        <span className="flex flex-col items-center gap-[0.2em]">
          {label}
          {/* Shown on the cell on the clock too: all four picks of a trade carry
              the mark, which is the point of numbering them. */}
          <span
            className={`flex text-[0.62em] ${onTheClock ? 'text-amber-950' : 'text-stone-500'}`}
          >
            <TradeBadge cell={cell.pick} trades={trades} leagueSize={leagueSize} roundDotPick />
          </span>
        </span>
      </div>
    )
  }

  return (
    <div className="min-h-[7.6vh] text-[clamp(0.55rem,0.82vw,1.05rem)]">
      <DraftCard
        player={player}
        pickLabel={label}
        faces={faces}
        note={<TradeBadge cell={cell.pick} trades={trades} leagueSize={leagueSize} roundDotPick />}
      />
    </div>
  )
}
