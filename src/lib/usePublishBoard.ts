import { useEffect, useRef, useState } from 'react'
import type { Session } from '../types'
import { currentPick } from './draft'
import { projectBoard, publishBoard, shareConfigured, type ShareConfig } from './share'

/** Picks arrive in bursts when the board is corrected; one publish covers them. */
const SETTLE_MS = 800

export type PublishState = 'off' | 'publishing' | 'live' | 'failed'

/**
 * Keep the shared board up to date while a draft is running.
 *
 * Publishes a projection — never the session — whenever anything the room can see
 * changes, coalesced so a run of corrections costs one write rather than ten. A
 * failure is reported and retried on the next change rather than thrown: losing
 * the shared board should never interrupt the draft in front of you.
 */
export function usePublishBoard(
  session: Session | null,
  config: ShareConfig,
): { state: PublishState; error: string | null } {
  const [state, setState] = useState<PublishState>('off')
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef<AbortController | null>(null)

  const shareId = session?.shareId
  const shareSecret = session?.shareSecret
  const ready = Boolean(session && shareId && shareSecret && shareConfigured(config))

  // Only the parts a viewer can see; a change to my sheet must not cause a write.
  const fingerprint = session
    ? JSON.stringify(
        projectBoard(session, currentPick(session.players, session.pickOffset)),
      ).replace(/"updatedAt":\d+/, '')
    : ''

  useEffect(() => {
    if (!ready || !session || !shareId || !shareSecret) {
      setState('off')
      return
    }

    const timer = window.setTimeout(() => {
      inFlight.current?.abort()
      const abort = new AbortController()
      inFlight.current = abort
      setState('publishing')
      const board = projectBoard(session, currentPick(session.players, session.pickOffset))
      void publishBoard(config, shareId, shareSecret, board, abort.signal)
        .then(() => {
          if (abort.signal.aborted) return
          setState('live')
          setError(null)
        })
        .catch((cause: unknown) => {
          if (abort.signal.aborted) return
          setState('failed')
          setError(cause instanceof Error ? cause.message : 'Could not publish the board')
        })
    }, SETTLE_MS)

    return () => window.clearTimeout(timer)
    // `fingerprint` is the real dependency: it changes exactly when viewers would
    // see something different.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, ready, shareId, shareSecret, config.url, config.anonKey])

  return { state, error }
}
