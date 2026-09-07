import { useEffect, useRef, useState } from 'react'
import { WifiOff } from 'lucide-react'
import type { Session } from '../types'
import { loadSettings } from '../lib/db'
import { boardToSession, fetchBoard, shareConfigured } from '../lib/share'
import PresentationBoard from './PresentationBoard'

/** Often enough that a pick appears while the room is still reacting to it. */
const POLL_MS = 3000
/** Say the connection is struggling only after a few consecutive misses. */
const TOLERATED_FAILURES = 3

/**
 * Somebody else's draft board, watched from your own machine.
 *
 * Read-only in the strongest sense available: this page has no write path at all,
 * and the key it holds cannot write either — publishing goes through a function
 * that demands a secret only the host has. It scrolls freely, so a viewer can go
 * back to round one and count up what a roster holds while round sixteen runs.
 *
 * No fun mode here. The announcements belong to the room's television, not to
 * eight laptops shouting over each other.
 */
export default function WatchBoard({ boardId }: { boardId: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const failures = useRef(0)
  const settings = loadSettings()
  const config = { url: settings.supabaseUrl, anonKey: settings.supabaseAnonKey }

  useEffect(() => {
    if (!shareConfigured(config)) {
      setError(
        'This app has no shared-board project configured, so it cannot load a watched board.',
      )
      return
    }

    let cancelled = false
    const abort = new AbortController()

    const tick = async () => {
      try {
        const board = await fetchBoard(config, boardId, abort.signal)
        if (cancelled) return
        if (!board) {
          setError('No board is being shared on this link yet.')
          return
        }
        if (board.v !== 1) {
          setError('This board was published by a newer version of the app. Reload the page.')
          return
        }
        failures.current = 0
        setStale(false)
        setError(null)
        setSession(boardToSession(board, boardId))
      } catch {
        if (cancelled) return
        failures.current += 1
        if (failures.current >= TOLERATED_FAILURES) setStale(true)
      }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), POLL_MS)
    return () => {
      cancelled = true
      abort.abort()
      window.clearInterval(timer)
    }
    // Settings are read once at load; changing them means reopening the link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId])

  if (error && !session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-semibold text-stone-700">{error}</p>
        <p className="text-xs text-stone-500">
          Check the link with whoever is running the draft.
        </p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-500">
        Loading the board…
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <PresentationBoard externalSession={session} viewOnly />
      {stale && (
        <div className="pointer-events-none fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-stone-900/90 px-3 py-1.5 text-xs text-white">
          <WifiOff size={13} />
          Reconnecting — showing the last board that arrived
        </div>
      )}
    </div>
  )
}
