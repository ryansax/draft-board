import { useRef, useState } from 'react'
import { Download, Plus, Settings, Trash2, Upload } from 'lucide-react'
import { useSessionStore } from '../store/session'
import { totalPicks } from '../lib/draft'
import { flushSaves } from '../lib/db'
import type { Session } from '../types'
import { Button } from './ui'

export default function Home({
  onNewDraft,
  onOpenSettings,
}: {
  onNewDraft: () => void
  onOpenSettings: () => void
}) {
  const { sessions, openSession, deleteSession, importSessionJson } = useSessionStore()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const handleImport = async (file: File) => {
    try {
      await importSessionJson(await file.text())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  const handleExport = async (session: Session) => {
    await flushSaves()
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${session.name.replace(/[^\w-]+/g, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto min-h-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Draft Board</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Your cheat sheet, live. Everything stays on this device.
          </p>
        </div>
        <Button variant="ghost" onClick={onOpenSettings} aria-label="Settings" className="!px-2.5">
          <Settings size={18} />
        </Button>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onNewDraft} className="px-4">
          <Plus size={18} /> New draft
        </Button>
        <Button onClick={() => fileInput.current?.click()}>
          <Upload size={16} /> Restore from JSON
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImport(file)
            e.target.value = ''
          }}
        />
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      {sessions.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-stone-300 p-10 text-center dark:border-stone-700">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            No drafts yet. Upload today's cheat sheet PDF to get started.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => {
            const marked = session.players.filter((p) => p.status !== 'available').length
            const total = totalPicks(session.leagueSize, session.rosterConfig)
            const pct = total ? Math.min(100, (marked / total) * 100) : 0
            return (
              <li
                key={session.id}
                className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => void openSession(session.id)}
                    className="min-w-0 flex-1 text-left tap-target"
                  >
                    <div className="truncate font-semibold">{session.name}</div>
                    <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                      {session.sheetDate ? `Sheet ${formatSheetDate(session.sheetDate)}` : session.sheetTitle} ·{' '}
                      {session.leagueSize}-team · slot {session.draftSlot}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-stone-500 dark:text-stone-400">
                        {marked} of {total} picks
                      </span>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      onClick={() => void handleExport(session)}
                      aria-label={`Export ${session.name}`}
                      className="!px-2"
                    >
                      <Download size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirming(session.id)}
                      aria-label={`Delete ${session.name}`}
                      className="!px-2 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>

                {confirming === session.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 p-3 dark:bg-rose-950/40">
                    <span className="mr-auto text-sm text-rose-800 dark:text-rose-300">
                      Delete "{session.name}"? This cannot be undone.
                    </span>
                    <Button onClick={() => setConfirming(null)}>Cancel</Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        void deleteSession(session.id)
                        setConfirming(null)
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function formatSheetDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${m}/${d}/${y}`
}
