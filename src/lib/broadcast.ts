import type { Session } from '../types'

const CHANNEL = 'draft-board:sessions'

export interface SessionBroadcast {
  type: 'session'
  session: Session
}

function open(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  try {
    return new BroadcastChannel(CHANNEL)
  } catch {
    return null
  }
}

/**
 * Push a session to any other window on this origin — the point being the
 * presentation board on the second screen, which must never lag the pick that
 * was just logged.
 */
export function publishSession(session: Session): void {
  const channel = open()
  if (!channel) return
  try {
    channel.postMessage({ type: 'session', session } satisfies SessionBroadcast)
  } catch {
    /* a session that will not structured-clone is not worth breaking a draft over */
  } finally {
    channel.close()
  }
}

/** Listen for sessions pushed from the control window. Returns an unsubscribe. */
export function subscribeToSessions(onSession: (session: Session) => void): () => void {
  const channel = open()
  if (!channel) return () => {}
  const handler = (event: MessageEvent) => {
    const data = event.data as SessionBroadcast | undefined
    if (data?.type === 'session' && data.session) onSession(data.session)
  }
  channel.addEventListener('message', handler)
  return () => {
    channel.removeEventListener('message', handler)
    channel.close()
  }
}
