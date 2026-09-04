import { BADGES, type Badge, type Player } from '../types'
import type { ParseIssue } from '../lib/parser/types'
import { adpTooltip } from '../lib/adp'
import { BADGE_ICONS, BADGE_COLORS } from './ui'
import { BADGE_LABELS } from '../types'

interface Props {
  players: Player[]
  issues: ParseIssue[]
  leagueSize: number
  onEdit: (playerId: string, patch: Partial<Player>) => void
  onToggleBadge: (playerId: string, badge: Badge) => void
}

export default function ReviewTable({ players, issues, leagueSize, onEdit, onToggleBadge }: Props) {
  const errorsByPlayer = new Map<string, ParseIssue[]>()
  for (const issue of issues) {
    if (!issue.playerId) continue
    if (!errorsByPlayer.has(issue.playerId)) errorsByPlayer.set(issue.playerId, [])
    errorsByPlayer.get(issue.playerId)!.push(issue)
  }

  const isRail = players.length > 0 && (players[0].position === 'DST' || players[0].position === 'K')

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-stone-100 text-left text-xs uppercase tracking-wide text-stone-500 dark:bg-stone-800 dark:text-stone-400">
          <tr>
            <th className="w-14 px-2 py-2 font-semibold">Rank</th>
            {!isRail && <th className="w-16 px-2 py-2 font-semibold">Tier</th>}
            <th className="px-2 py-2 font-semibold">Name</th>
            <th className="w-20 px-2 py-2 font-semibold">Team</th>
            {!isRail && (
              <th className="w-20 px-2 py-2 font-semibold" title="The 12-team value printed on the sheet">
                ADP <span className="font-normal normal-case opacity-70">(12tm)</span>
              </th>
            )}
            {!isRail && (
              <th
                className="w-24 px-2 py-2 font-semibold"
                title="Overall pick number — this is the ADP the board shows"
              >
                Overall
              </th>
            )}
            {!isRail && <th className="w-20 px-2 py-2 font-semibold">Risk</th>}
            {!isRail && <th className="w-20 px-2 py-2 font-semibold">Up</th>}
            <th className="px-2 py-2 font-semibold">Badges</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const playerIssues = errorsByPlayer.get(player.id) ?? []
            const hasError = playerIssues.some((i) => i.level === 'error')
            const hasWarning = playerIssues.some((i) => i.level === 'warning')
            return (
              <tr
                key={player.id}
                title={playerIssues.map((i) => i.message).join('\n') || undefined}
                className={
                  hasError
                    ? 'bg-rose-50 dark:bg-rose-950/40'
                    : hasWarning
                      ? 'bg-amber-50 dark:bg-amber-950/30'
                      : 'odd:bg-white even:bg-stone-50 dark:odd:bg-stone-900 dark:even:bg-stone-900/50'
                }
              >
                <Cell
                  value={String(player.rank)}
                  width="w-12"
                  onCommit={(v) => onEdit(player.id, { rank: Number(v) || player.rank })}
                />
                {!isRail && (
                  <Cell
                    value={player.tier === null ? '' : String(player.tier)}
                    width="w-12"
                    onCommit={(v) => onEdit(player.id, { tier: v.trim() === '' ? null : Number(v) || null })}
                  />
                )}
                <Cell value={player.name} width="w-full" onCommit={(v) => onEdit(player.id, { name: v.trim() })} />
                <Cell
                  value={player.team}
                  width="w-16"
                  onCommit={(v) => onEdit(player.id, { team: v.trim().toUpperCase() })}
                />
                {!isRail && (
                  <Cell
                    value={player.adp12 ?? ''}
                    placeholder="-"
                    width="w-16"
                    onCommit={(v) => onEdit(player.id, { adp12: v.trim() === '' || v.trim() === '-' ? null : v.trim() })}
                  />
                )}
                {!isRail && <ConvertedCell player={player} leagueSize={leagueSize} />}
                {!isRail && (
                  <Cell
                    value={player.risk === null ? '' : String(player.risk)}
                    width="w-14"
                    onCommit={(v) => onEdit(player.id, { risk: v.trim() === '' ? null : Number(v) })}
                  />
                )}
                {!isRail && (
                  <Cell
                    value={player.upside === null ? '' : String(player.upside)}
                    width="w-14"
                    onCommit={(v) => onEdit(player.id, { upside: v.trim() === '' ? null : Number(v) })}
                  />
                )}
                <td className="px-2 py-1">
                  <div className="flex flex-wrap gap-0.5">
                    {BADGES.map((badge) => {
                      const Icon = BADGE_ICONS[badge]
                      const on = player.badges.includes(badge)
                      return (
                        <button
                          key={badge}
                          type="button"
                          title={BADGE_LABELS[badge]}
                          aria-label={`${BADGE_LABELS[badge]} for ${player.name}`}
                          aria-pressed={on}
                          onClick={() => onToggleBadge(player.id, badge)}
                          className={`flex h-9 w-9 items-center justify-center rounded transition-colors ${
                            on
                              ? `bg-stone-200 dark:bg-stone-700 ${BADGE_COLORS[badge]}`
                              : 'text-stone-300 hover:bg-stone-100 dark:text-stone-600 dark:hover:bg-stone-800'
                          }`}
                        >
                          <Icon size={16} strokeWidth={2.25} />
                        </button>
                      )
                    })}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Read-only preview of the overall pick number derived from the printed ADP, so the
 * maths can be eyeballed here rather than discovered on the board mid-draft.
 */
function ConvertedCell({ player, leagueSize }: { player: Player; leagueSize: number }) {
  if (player.adpOverall === null) {
    return <td className="px-2 py-1 text-stone-400">-</td>
  }
  return (
    <td className="px-2 py-1" title={adpTooltip(player.adp12, player.adpOverall, leagueSize)}>
      <span className="font-semibold tabular-nums">{player.adpOverall}</span>
    </td>
  )
}

/**
 * Uncommitted text input: edits land on blur / Enter so a half-typed value never
 * trips validation mid-keystroke.
 */
function Cell({
  value,
  width,
  placeholder,
  onCommit,
}: {
  value: string
  width: string
  placeholder?: string
  onCommit: (value: string) => void
}) {
  return (
    <td className="px-2 py-1">
      <input
        defaultValue={value}
        key={value}
        placeholder={placeholder}
        spellCheck={false}
        onBlur={(e) => {
          if (e.target.value !== value) onCommit(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            e.currentTarget.value = value
            e.currentTarget.blur()
          }
        }}
        className={`${width} min-h-9 rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-stone-300 focus:border-emerald-500 focus:bg-white focus:outline-none dark:hover:border-stone-600 dark:focus:bg-stone-800`}
      />
    </td>
  )
}
