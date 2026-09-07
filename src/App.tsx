import { useEffect, useState } from 'react'
import { useSessionStore } from './store/session'
import Home from './components/Home'
import ImportFlow from './components/ImportFlow'
import Board from './components/Board'
import SettingsDialog from './components/SettingsDialog'
import PresentationBoard from './components/PresentationBoard'
import WatchBoard from './components/WatchBoard'

/** `#/present/<sessionId>` opens the read-only room display in its own window. */
const PRESENT_ROUTE = /^#\/present\/(.+)$/
/** `#/watch/<boardId>` follows a board somebody else is publishing. */
const WATCH_ROUTE = /^#\/watch\/(.+)$/

type Route = 'home' | 'import'

export default function App() {
  const { ready, active, init, settings, closeSession } = useSessionStore()
  const [route, setRoute] = useState<Route>('home')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  /** A stable string (or null) — `exec` returns a fresh array each render. */
  const presentingSessionId = (() => {
    const match = PRESENT_ROUTE.exec(hash)
    return match ? decodeURIComponent(match[1]) : null
  })()

  const watchingBoardId = (() => {
    const match = WATCH_ROUTE.exec(hash)
    return match ? decodeURIComponent(match[1]) : null
  })()

  useEffect(() => {
    // Neither the presentation window nor a watcher adopts the control window's
    // active draft, and neither writes anything back.
    if (!presentingSessionId && !watchingBoardId) void init()
  }, [init, presentingSessionId, watchingBoardId])

  useEffect(() => {
    // The room display is always light — it goes on a TV in daylight, where a dark
    // screen mirrors the room. It must not inherit the control window's theme.
    document.documentElement.classList.toggle(
      'dark',
      settings.darkMode && !presentingSessionId && !watchingBoardId,
    )
  }, [settings.darkMode, presentingSessionId, watchingBoardId])

  if (watchingBoardId) {
    return <WatchBoard boardId={watchingBoardId} />
  }

  if (presentingSessionId) {
    return <PresentationBoard sessionId={presentingSessionId} />
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-stone-500">Loading your drafts…</div>
    )
  }

  return (
    <>
      {active ? (
        <Board
          onExit={() => {
            closeSession()
            setRoute('home')
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : route === 'import' ? (
        <ImportFlow onDone={() => setRoute('home')} onCancel={() => setRoute('home')} />
      ) : (
        <Home onNewDraft={() => setRoute('import')} onOpenSettings={() => setSettingsOpen(true)} />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  )
}
