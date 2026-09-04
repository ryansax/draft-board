import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, FileText, TriangleAlert, Upload } from 'lucide-react'
import {
  DEFAULT_ROSTER,
  defaultManagers,
  LEAGUE_SIZES,
  POSITIONS,
  type Badge,
  type LeagueSize,
  type Player,
  type Position,
  type RosterConfig,
} from '../types'
import { parseSheet, validate } from '../lib/parser/parse'
import { parseCsv } from '../lib/parser/csv'
import { mergeBadges } from '../lib/parser/ai'
import type { ParsedSheet, ParseIssue } from '../lib/parser/types'
import { useSessionStore, toggleBadge } from '../store/session'
import ReviewTable from './ReviewTable'
import { Button, PositionPill } from './ui'
import { formatSheetDate } from './Home'

type Stage = 'upload' | 'parsing' | 'review'

export default function ImportFlow({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { createSession, settings } = useSessionStore()
  const [stage, setStage] = useState<Stage>('upload')
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [importIssues, setImportIssues] = useState<ParseIssue[]>([])
  const [tab, setTab] = useState<Position>('QB')
  const [csvText, setCsvText] = useState('')
  const [showCsv, setShowCsv] = useState(false)

  const [name, setName] = useState('')
  const [leagueSize, setLeagueSize] = useState<LeagueSize>(10)
  const [draftSlot, setDraftSlot] = useState(1)
  const [roster, setRoster] = useState<RosterConfig>({ ...DEFAULT_ROSTER })
  const [managers, setManagers] = useState<string[]>(() => defaultManagers(10, 1))

  const fileInput = useRef<HTMLInputElement>(null)

  /** Validation re-runs on every edit so Commit unblocks the moment the sheet is clean. */
  const issues = useMemo(() => [...importIssues, ...validate(players)], [players, importIssues])
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')

  const adopt = (parsed: ParsedSheet, extra: ParseIssue[] = []) => {
    setSheet(parsed)
    setPlayers(parsed.players)
    setImportIssues([...parsed.issues.filter((i) => !i.playerId || true), ...extra].filter((i) => !isRowIssue(i)))
    setName(defaultSessionName(parsed.sheetDate))
    setStage('review')
    const firstWithPlayers = POSITIONS.find((p) => parsed.players.some((x) => x.position === p))
    if (firstWithPlayers) setTab(firstWithPlayers)
  }

  const handlePdf = async (file: File) => {
    setStage('parsing')
    setError(null)
    try {
      setStatus('Reading the PDF…')
      // pdf.js and its worker are ~1MB; keep them off the board's critical path.
      const { extractPagesFromPdf, renderPagesToPng } = await import('../lib/parser/pdf.browser')
      const buffer = await file.arrayBuffer()
      const pages = await extractPagesFromPdf(buffer.slice(0))
      const parsed = parseSheet(pages)

      if (settings.aiParseEnabled && settings.anthropicApiKey.trim()) {
        try {
          setStatus('Rendering pages for the badge pass…')
          const images = await renderPagesToPng(buffer.slice(0))
          setStatus('Asking Claude to read the badge glyphs…')
          const { extractBadgesWithAi } = await import('../lib/parser/ai')
          const rows = await extractBadgesWithAi(images, settings.anthropicApiKey.trim())
          const merged = mergeBadges(parsed.players, rows)
          adopt({ ...parsed, players: merged.players }, merged.issues)
          return
        } catch (e) {
          adopt(parsed, [
            {
              level: 'warning',
              message: `AI badge pass failed (${e instanceof Error ? e.message : 'unknown error'}). Tag badges by hand below.`,
            },
          ])
          return
        }
      }
      adopt(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that PDF.')
      setStage('upload')
    }
  }

  const handleCsv = () => {
    const parsed = parseCsv(csvText)
    if (parsed.players.length === 0) {
      setError('No rows could be read from that text.')
      return
    }
    setError(null)
    adopt(parsed)
  }

  const commit = async () => {
    if (!sheet || errors.length > 0) return
    await createSession(sheet, players, {
      name: name.trim() || defaultSessionName(sheet.sheetDate),
      leagueSize,
      draftSlot: Math.min(Math.max(1, draftSlot), leagueSize),
      rosterConfig: roster,
      managers: managers.map((m, i) => m.trim() || `Team ${i + 1}`),
    })
    onDone()
  }

  // --- Upload ---------------------------------------------------------------
  if (stage === 'upload' || stage === 'parsing') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Button variant="ghost" onClick={onCancel} className="mb-6 !px-2">
          <ArrowLeft size={16} /> Back
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">New draft</h1>
        <p className="mt-1 mb-6 text-sm text-stone-500 dark:text-stone-400">
          Upload today's Fantasy Footballers cheat sheet PDF.
        </p>

        {stage === 'parsing' ? (
          <div className="rounded-xl border border-stone-200 bg-white p-10 text-center dark:border-stone-700 dark:bg-stone-900">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-emerald-600" />
            <p className="text-sm text-stone-600 dark:text-stone-300">{status}</p>
          </div>
        ) : (
          <>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) void handlePdf(file)
              }}
              className="rounded-xl border-2 border-dashed border-stone-300 bg-white p-10 text-center dark:border-stone-700 dark:bg-stone-900"
            >
              <FileText size={32} className="mx-auto mb-3 text-stone-400" />
              <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">Drop the PDF here, or</p>
              <Button variant="primary" onClick={() => fileInput.current?.click()} className="px-4">
                <Upload size={16} /> Choose PDF
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handlePdf(file)
                  e.target.value = ''
                }}
              />
            </div>

            {error && (
              <p className="mt-4 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                {error}
              </p>
            )}

            <div className="mt-6">
              <button
                onClick={() => setShowCsv((v) => !v)}
                className="text-sm text-stone-500 underline underline-offset-2 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
              >
                {showCsv ? 'Hide' : 'Paste CSV / TSV instead'}
              </button>
              {showCsv && (
                <div className="mt-3">
                  <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
                    Columns: <code>position, rank, tier, name, team, adp12, risk, upside, badges</code>. A header row
                    is optional.
                  </p>
                  <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    rows={8}
                    spellCheck={false}
                    placeholder="QB,1,1,Josh Allen,BUF,2.03,2.6,9.7,myGuy"
                    className="w-full rounded-lg border border-stone-300 bg-white p-3 font-mono text-xs dark:border-stone-600 dark:bg-stone-800"
                  />
                  <Button variant="primary" onClick={handleCsv} className="mt-2 px-4" disabled={!csvText.trim()}>
                    Parse rows
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  // --- Review + configure ---------------------------------------------------
  const positionsWithPlayers = POSITIONS.filter((p) => players.some((x) => x.position === p))
  const errorCountFor = (position: Position) =>
    errors.filter((i) => i.position === position).length

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-stone-200 bg-white px-4 py-3 dark:border-stone-700 dark:bg-stone-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={onCancel} className="!px-2">
            <ArrowLeft size={16} />
          </Button>
          <div className="mr-auto min-w-0">
            <div className="truncate font-semibold">{sheet?.sheetTitle}</div>
            <div className="text-xs text-stone-500 dark:text-stone-400">
              {sheet?.sheetDate ? formatSheetDate(sheet.sheetDate) : 'No date found'} · {players.length} players parsed
            </div>
          </div>
          <Button
            variant="primary"
            className="px-4"
            disabled={errors.length > 0}
            onClick={() => void commit()}
            title={errors.length > 0 ? 'Fix the highlighted errors first' : undefined}
          >
            <Check size={16} /> Commit &amp; start draft
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-5">
          {/* League configuration */}
          <section className="mb-5 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              League
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">Draft name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">Teams</span>
                <select
                  value={leagueSize}
                  onChange={(e) => {
                    const size = Number(e.target.value) as LeagueSize
                    const slot = Math.min(draftSlot, size)
                    setLeagueSize(size)
                    setDraftSlot(slot)
                    setManagers((current) =>
                      defaultManagers(size, slot).map((fallback, i) => {
                        const kept = current[i]
                        return kept && !/^(Me|Team \d+)$/.test(kept) ? kept : fallback
                      }),
                    )
                  }}
                  className="tap-target w-full rounded-lg border border-stone-300 bg-white px-3 text-sm dark:border-stone-600 dark:bg-stone-800"
                >
                  {LEAGUE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size} teams
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
                  My draft slot
                </span>
                <select
                  value={draftSlot}
                  onChange={(e) => {
                    const slot = Number(e.target.value)
                    setDraftSlot(slot)
                    setManagers((current) =>
                      current.map((name, i) =>
                        /^(Me|Team \d+)$/.test(name)
                          ? i + 1 === slot
                            ? 'Me'
                            : `Team ${i + 1}`
                          : name,
                      ),
                    )
                  }}
                  className="tap-target w-full rounded-lg border border-stone-300 bg-white px-3 text-sm dark:border-stone-600 dark:bg-stone-800"
                >
                  {Array.from({ length: leagueSize }, (_, i) => i + 1).map((slot) => (
                    <option key={slot} value={slot}>
                      Pick {slot}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <details className="mt-4" open>
              <summary className="cursor-pointer text-xs font-medium text-stone-600 dark:text-stone-400">
                Who is in each draft slot
              </summary>
              <p className="mt-1 mb-2 text-xs text-stone-500 dark:text-stone-400">
                Optional, and editable later. Naming the other managers lets the draft board
                show whose pick is whose and work out what is likely to go before your turn.
              </p>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {managers.map((manager, index) => (
                  <label
                    key={index}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${
                      index + 1 === draftSlot
                        ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40'
                        : 'border-stone-200 dark:border-stone-700'
                    }`}
                  >
                    <span className="w-5 shrink-0 text-center text-[11px] font-bold text-stone-400">
                      {index + 1}
                    </span>
                    <input
                      value={manager}
                      onChange={(e) =>
                        setManagers((current) =>
                          current.map((m, i) => (i === index ? e.target.value : m)),
                        )
                      }
                      className="min-h-9 w-full min-w-0 rounded bg-transparent px-1 text-sm focus:bg-white focus:outline-none dark:focus:bg-stone-800"
                    />
                  </label>
                ))}
              </div>
            </details>

            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-medium text-stone-600 dark:text-stone-400">
                Roster shape
              </summary>
              <div className="mt-3 flex flex-wrap gap-3">
                {(Object.keys(roster) as Array<keyof RosterConfig>).map((slot) => (
                  <label key={slot} className="flex items-center gap-2">
                    <span className="w-10 text-xs font-semibold">{slot}</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={roster[slot]}
                      onChange={(e) =>
                        setRoster((r) => ({ ...r, [slot]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) }))
                      }
                      className="w-16 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-600 dark:bg-stone-800"
                    />
                  </label>
                ))}
              </div>
            </details>
          </section>

          {/* Validation summary */}
          {errors.length > 0 && (
            <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/40">
              <div className="mb-2 flex items-center gap-2 font-semibold text-rose-800 dark:text-rose-300">
                <TriangleAlert size={16} />
                {errors.length} {errors.length === 1 ? 'problem' : 'problems'} to fix before committing
              </div>
              <ul className="ml-1 space-y-0.5 text-sm text-rose-800 dark:text-rose-300">
                {errors.slice(0, 8).map((issue, i) => (
                  <li key={i}>· {issue.message}</li>
                ))}
                {errors.length > 8 && <li className="opacity-70">…and {errors.length - 8} more</li>}
              </ul>
            </div>
          )}
          {errors.length === 0 && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Check size={16} /> Parse looks clean. Check a few rows, then commit.
            </div>
          )}
          {warnings.length > 0 && (
            <details className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
              <summary className="cursor-pointer text-sm font-medium text-amber-900 dark:text-amber-300">
                {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}
              </summary>
              <ul className="mt-2 space-y-0.5 text-sm text-amber-900 dark:text-amber-300">
                {warnings.slice(0, 20).map((issue, i) => (
                  <li key={i}>· {issue.message}</li>
                ))}
              </ul>
            </details>
          )}
          {sheet && sheet.unparsed.length > 0 && (
            <details className="mb-4 rounded-xl border border-stone-300 bg-stone-50 p-4 text-sm dark:border-stone-700 dark:bg-stone-900">
              <summary className="cursor-pointer font-medium">
                {sheet.unparsed.length} line(s) the parser skipped
              </summary>
              <ul className="mt-2 space-y-0.5 font-mono text-xs text-stone-600 dark:text-stone-400">
                {sheet.unparsed.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </details>
          )}

          {/* Per-position tables */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {positionsWithPlayers.map((position) => {
              const count = players.filter((p) => p.position === position).length
              const bad = errorCountFor(position)
              return (
                <button
                  key={position}
                  onClick={() => setTab(position)}
                  className={`tap-target flex items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
                    tab === position
                      ? 'bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900'
                      : 'bg-white text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200'
                  }`}
                >
                  {position}
                  <span className="opacity-60">{count}</span>
                  {bad > 0 && (
                    <span className="rounded bg-rose-600 px-1 text-[10px] font-bold text-white">{bad}</span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
            <div className="flex items-center gap-2 border-b border-stone-200 px-3 py-2 dark:border-stone-700">
              <PositionPill position={tab} />
              <span className="text-xs text-stone-500 dark:text-stone-400">
                Tap any field to edit. Toggle badges on the right. ADP is shown as printed and
                as the overall pick number the board uses.
              </span>
            </div>
            <ReviewTable
              players={players.filter((p) => p.position === tab)}
              issues={issues}
              leagueSize={leagueSize}
              onEdit={(playerId, patch) =>
                setPlayers((list) => list.map((p) => (p.id === playerId ? applyEdit(p, patch) : p)))
              }
              onToggleBadge={(playerId, badge: Badge) =>
                setPlayers((list) =>
                  list.map((p) => (p.id === playerId ? { ...p, badges: toggleBadge(p.badges, badge) } : p)),
                )
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Keep derived fields consistent when a field is edited by hand. */
function applyEdit(player: Player, patch: Partial<Player>): Player {
  const next = { ...player, ...patch }
  if ('adp12' in patch) {
    next.adpOverall = adpOverallOf(next.adp12)
  }
  if ('rank' in patch || 'position' in patch) {
    next.id = `${next.position}-${next.rank}`
  }
  return next
}

function adpOverallOf(adp12: string | null): number | null {
  if (!adp12 || !/^\d{1,2}\.\d{2}$/.test(adp12)) return null
  const [r, p] = adp12.split('.').map(Number)
  if (r < 1 || p < 1 || p > 12) return null
  return (r - 1) * 12 + p
}

/** Row-level problems are recomputed live; only sheet-level notes are pinned. */
function isRowIssue(issue: ParseIssue): boolean {
  return Boolean(issue.playerId) || Boolean(issue.rank)
}

function defaultSessionName(sheetDate: string | null): string {
  if (!sheetDate) return 'Draft'
  const [, m, d] = sheetDate.split('-')
  return `Draft - sheet ${Number(m)}/${Number(d)}`
}
