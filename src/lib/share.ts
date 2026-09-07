import type { PickTrade } from './trades'
import type { Player, Position, RosterConfig, Session } from '../types'

/**
 * Publishing the board so friends can watch it from their own machines.
 *
 * What goes out is a projection, not the session. The session carries the whole
 * cheat sheet — every rank, tier, risk and upside score, and the badges marking
 * the owner's guys — and this board is public to anyone holding the link. Only
 * what the room display actually draws is sent: who was taken, where, by whom.
 *
 * That is a stronger guarantee than filtering at render time. The viewer cannot
 * show a number it was never given, however the page is later changed.
 */

/** One made pick, as the room needs to see it. */
export interface SharedPick {
  /** Board cell, which is where the card sits and who it belongs to. */
  cell: number
  name: string
  position: Position
  team: string
}

export interface SharedBoard {
  /** Bumped when the shape changes, so an old viewer says so rather than breaking. */
  v: 1
  name: string
  sheetTitle: string
  sheetDate: string | null
  leagueSize: number
  managers: string[]
  rosterConfig: RosterConfig
  trades: PickTrade[]
  picks: SharedPick[]
  /** How many selections deep the draft is, so the clock lands on the right cell. */
  moment: number
  updatedAt: number
}

export interface ShareConfig {
  url: string
  anonKey: string
}

export function shareConfigured(config: ShareConfig): boolean {
  return config.url.trim().length > 0 && config.anonKey.trim().length > 0
}

/** Everything public about the board, and nothing else. */
export function projectBoard(session: Session, moment: number): SharedBoard {
  const picks: SharedPick[] = session.players
    .filter((p) => p.draftedAtPick !== null && p.status !== 'available')
    .map((p) => ({
      cell: p.draftedAtPick as number,
      name: p.name,
      position: p.position,
      team: p.team,
    }))
    .sort((a, b) => a.cell - b.cell)

  return {
    v: 1,
    name: session.name,
    sheetTitle: session.sheetTitle,
    sheetDate: session.sheetDate,
    leagueSize: session.leagueSize,
    managers: session.managers,
    rosterConfig: session.rosterConfig,
    trades: session.trades,
    picks,
    moment,
    updatedAt: Date.now(),
  }
}

/**
 * Rebuild something the room display can render.
 *
 * The board component takes a session, so the viewer hands it one — built only
 * from what arrived. The sheet columns get null rather than invented values, and
 * `draftSlot` is zero so no cell is anybody's in particular: a watched board is
 * impersonal, the same as the one on the television.
 */
export function boardToSession(board: SharedBoard, id: string): Session {
  const players: Player[] = board.picks.map((pick) => ({
    id: `${pick.cell}`,
    position: pick.position,
    rank: 0,
    tier: null,
    name: pick.name,
    team: pick.team,
    adp12: null,
    adpOverall: null,
    risk: null,
    upside: null,
    badges: [],
    status: 'drafted',
    draftedAtPick: pick.cell,
  }))

  return {
    id,
    name: board.name,
    createdAt: 0,
    updatedAt: board.updatedAt,
    sheetTitle: board.sheetTitle,
    sheetDate: board.sheetDate,
    leagueSize: board.leagueSize,
    // Nobody's slot: a watched board highlights no one.
    draftSlot: 0,
    managers: board.managers,
    rosterConfig: board.rosterConfig,
    players,
    undoStack: [],
    // The clock counts marked players plus this, so it lands on the host's moment.
    pickOffset: board.moment - players.length - 1,
    trades: board.trades,
    dismissedTierAlerts: [],
  } as Session
}

function headers(config: ShareConfig): Record<string, string> {
  return {
    apikey: config.anonKey.trim(),
    authorization: `Bearer ${config.anonKey.trim()}`,
    'content-type': 'application/json',
  }
}

function base(config: ShareConfig): string {
  return config.url.trim().replace(/\/+$/, '')
}

/**
 * Push the board up. The first publish claims the id with the key; every later
 * one has to present the same key, which is what keeps a viewer read-only.
 */
export async function publishBoard(
  config: ShareConfig,
  id: string,
  secret: string,
  board: SharedBoard,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${base(config)}/rest/v1/rpc/publish_board`, {
    method: 'POST',
    headers: headers(config),
    signal,
    body: JSON.stringify({ p_id: id, p_secret: secret, p_state: board }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Publish failed (${response.status}): ${detail.slice(0, 200)}`)
  }
}

/** Read a board. Returns null when the id is not published yet. */
export async function fetchBoard(
  config: ShareConfig,
  id: string,
  signal?: AbortSignal,
): Promise<SharedBoard | null> {
  const query = `${base(config)}/rest/v1/boards?id=eq.${encodeURIComponent(id)}&select=state,updated_at`
  const response = await fetch(query, { headers: headers(config), signal })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Could not load the board (${response.status}): ${detail.slice(0, 200)}`)
  }
  const rows = (await response.json()) as Array<{ state: SharedBoard }>
  return rows[0]?.state ?? null
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

/** Short, unambiguous, and read aloud without confusion over l/1 or O/0. */
export function randomToken(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

/** The link a viewer opens. Same app, watching rather than drafting. */
export function watchUrl(boardId: string): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/watch/${encodeURIComponent(boardId)}`
}
