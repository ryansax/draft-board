import Dexie, { type Table } from 'dexie'
import { DEFAULT_SETTINGS, type AppSettings, type Session } from '../types'
import { publishSession } from './broadcast'
import type { HeadshotIndex } from './headshots'

interface CacheRow {
  key: string
  value: unknown
}

class DraftBoardDb extends Dexie {
  sessions!: Table<Session, string>
  cache!: Table<CacheRow, string>

  constructor() {
    super('draft-board')
    this.version(1).stores({ sessions: 'id, updatedAt, createdAt' })
    this.version(2).stores({ sessions: 'id, updatedAt, createdAt', cache: 'key' })
  }
}

export const db = new DraftBoardDb()

export async function listSessions(): Promise<Session[]> {
  const all = await db.sessions.toArray()
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getSession(id: string): Promise<Session | undefined> {
  return db.sessions.get(id)
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id)
}

/**
 * Autosave. Draft day is chaotic and taps come fast, so writes coalesce onto the
 * latest state per session rather than queueing up behind each other — but the
 * final state is always written.
 */
const pending = new Map<string, Session>()
const inFlight = new Map<string, Promise<void>>()

export function saveSession(session: Session): Promise<void> {
  pending.set(session.id, session)
  const existing = inFlight.get(session.id)
  if (existing) return existing

  const run = (async () => {
    try {
      while (pending.has(session.id)) {
        const next = pending.get(session.id)!
        pending.delete(session.id)
        await db.sessions.put(next)
        // Mirror straight to the presentation window, if one is open.
        publishSession(next)
      }
    } finally {
      inFlight.delete(session.id)
    }
  })()
  inFlight.set(session.id, run)
  return run
}

/** Resolves once every queued write has landed — used before export. */
export async function flushSaves(): Promise<void> {
  await Promise.all([...inFlight.values()])
}

const HEADSHOT_KEY = 'headshot-index'

export async function loadHeadshotIndex(): Promise<HeadshotIndex | null> {
  try {
    const row = await db.cache.get(HEADSHOT_KEY)
    return (row?.value as HeadshotIndex) ?? null
  } catch {
    return null
  }
}

export async function saveHeadshotIndex(index: HeadshotIndex): Promise<void> {
  try {
    await db.cache.put({ key: HEADSHOT_KEY, value: index })
  } catch {
    /* a full quota should not stop the draft; images just will not cache */
  }
}

// --- Settings live in localStorage: small, synchronous, and read on first paint --

const SETTINGS_KEY = 'draft-board:settings'

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * The id of the draft that was open when the page last unloaded, so a refresh or
 * crash mid-draft lands back on the board rather than the home screen.
 */
const ACTIVE_KEY = 'draft-board:active-session'

export function loadActiveSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

export function saveActiveSessionId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch {
    /* ignore */
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* private browsing, quota — settings are not worth failing the app over */
  }
}
