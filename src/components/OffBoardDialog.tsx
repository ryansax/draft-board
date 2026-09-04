import { useState } from 'react'
import { X } from 'lucide-react'
import { POSITIONS, type Position } from '../types'
import { NFL_TEAMS, FREE_AGENT_CODE } from '../lib/nflTeams'
import { Button } from './ui'

/**
 * Someone took a player the cheat sheet never listed. Capture just enough to put
 * them on the board and log the pick.
 */
export default function OffBoardDialog({
  onAdd,
  onClose,
}: {
  onAdd: (details: { firstName: string; lastName: string; position: Position; team: string }) => void
  onClose: () => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [position, setPosition] = useState<Position>('WR')
  const [team, setTeam] = useState('ARI')

  const canSubmit = lastName.trim().length > 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    onAdd({ firstName, lastName, position, team })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-stone-900"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Off-the-board selection</h2>
          <Button variant="ghost" onClick={onClose} type="button" aria-label="Close" className="!px-2">
            <X size={18} />
          </Button>
        </div>
        <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
          For a player who is not on the cheat sheet. They will be added to the board and logged
          as this pick.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
              First name
            </span>
            <input
              autoFocus
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              spellCheck={false}
              className="tap-target w-full rounded-lg border border-stone-300 bg-white px-3 text-sm dark:border-stone-600 dark:bg-stone-800"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
              Last name
            </span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              spellCheck={false}
              required
              className="tap-target w-full rounded-lg border border-stone-300 bg-white px-3 text-sm dark:border-stone-600 dark:bg-stone-800"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
              Position
            </span>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as Position)}
              className="tap-target w-full rounded-lg border border-stone-300 bg-white px-3 text-sm dark:border-stone-600 dark:bg-stone-800"
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
              Team
            </span>
            <select
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              className="tap-target w-full rounded-lg border border-stone-300 bg-white px-3 text-sm dark:border-stone-600 dark:bg-stone-800"
            >
              {NFL_TEAMS.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.code} — {t.city} {t.nickname}
                </option>
              ))}
              <option value={FREE_AGENT_CODE}>FA — free agent</option>
            </select>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="px-4" disabled={!canSubmit}>
            Add &amp; log pick
          </Button>
        </div>
      </form>
    </div>
  )
}
