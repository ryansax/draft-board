import { useState } from 'react'
import { Check, Copy, Link2, X } from 'lucide-react'
import type { Session } from '../types'
import { Button } from './ui'
import { shareConfigured, watchUrl, type ShareConfig } from '../lib/share'
import type { PublishState } from '../lib/usePublishBoard'

/**
 * The link friends open to watch the draft from their own machines.
 *
 * What they get is the room display without the room: the same board, scrollable,
 * with no announcements and nothing they can change. What they do not get is the
 * cheat sheet — only made picks are published, so the ranks and tiers behind them
 * stay on this machine.
 */
export default function ShareDialog({
  session,
  config,
  state,
  error,
  onStartSharing,
  onStopSharing,
  onClose,
}: {
  session: Session
  config: ShareConfig
  state: PublishState
  error: string | null
  onStartSharing: () => void
  onStopSharing: () => void
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const configured = shareConfigured(config)
  const link = session.shareId ? watchUrl(session.shareId, config) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Share the board</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              A read-only board your friends can open and scroll on their own machines.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-stone-500">
            <X size={18} />
          </button>
        </div>

        {!configured ? (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Add your shared-board project URL and key in Settings first. Without them there is
            nowhere to publish the board to.
          </p>
        ) : !link ? (
          <>
            <p className="mt-4 text-sm text-stone-600 dark:text-stone-300">
              Publishing sends the made picks, the managers and any trades — enough to draw the
              board. Your rankings, tiers, risk and upside are not sent and cannot be seen by
              anyone holding the link.
            </p>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={onStartSharing}
                className="bg-emerald-600 px-3 text-white hover:bg-emerald-700"
              >
                <Link2 size={16} /> Start sharing
              </Button>
            </div>
          </>
        ) : (
          <>
            <label className="mt-4 block text-xs font-medium">
              <span className="text-stone-500 dark:text-stone-400">Send this to your league</span>
              <span className="mt-1 flex items-center gap-2 rounded border border-stone-300 px-2 dark:border-stone-700">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-h-9 w-full bg-transparent font-mono text-[11px] focus:outline-none"
                />
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(link).then(() => {
                      setCopied(true)
                      window.setTimeout(() => setCopied(false), 1500)
                    })
                  }}
                  aria-label="Copy the link"
                  className="tap-target flex w-9 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                </button>
              </span>
            </label>

            <p className="mt-3 flex items-center gap-2 text-xs">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  state === 'live'
                    ? 'bg-emerald-500'
                    : state === 'failed'
                      ? 'bg-rose-500'
                      : 'bg-amber-400'
                }`}
              />
              <span className="text-stone-600 dark:text-stone-300">
                {state === 'live'
                  ? 'Live — every pick goes up as you log it.'
                  : state === 'publishing'
                    ? 'Publishing…'
                    : state === 'failed'
                      ? (error ?? 'The last publish failed. It will retry on your next pick.')
                      : 'Waiting for the first pick.'}
              </span>
            </p>

            <p className="mt-3 text-[11px] text-stone-500 dark:text-stone-400">
              The link carries everything a viewer needs, so nobody has to set anything up —
              they just open it. It cannot change the board: publishing needs a key that
              stays on this machine.
            </p>

            <div className="mt-4 flex justify-between">
              <button
                onClick={onStopSharing}
                className="rounded px-2 py-1 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                Stop sharing
              </button>
              <Button onClick={onClose} className="px-3">
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
