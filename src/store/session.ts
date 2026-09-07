import { create } from 'zustand'
import {
  DEFAULT_ROSTER,
  defaultManagers,
  type AppSettings,
  type Badge,
  type LeagueSize,
  type Player,
  type PlayerStatus,
  type Position,
  type RosterConfig,
  type Session,
  type UndoEntry,
} from '../types'
import * as db from '../lib/db'
import { newId } from '../lib/id'
import { currentPick } from '../lib/draft'
import { isMyTurn, statusForTap } from '../lib/insights'
import { cellForMoment, swapNextPicks } from '../lib/trades'
import type { ParsedSheet } from '../lib/parser/types'

/** Section 6: "stack of at least 20 actions". */
const UNDO_LIMIT = 50

export interface NewSessionConfig {
  name: string
  leagueSize: LeagueSize
  draftSlot: number
  rosterConfig: RosterConfig
  managers: string[]
}

/** Shared body of every status change, so the undo stack behaves identically. */
function applyMark(
  session: Session,
  playerId: string,
  resolve: (pick: number) => PlayerStatus,
): Session | null {
  const player = session.players.find((p) => p.id === playerId)
  if (!player) return null

  const moment = currentPick(session.players, session.pickOffset)
  // Without trades this is the same number; with them, the card belongs to the
  // manager whose turn was moved here, in their own column.
  const pick = cellForMoment(moment, session.trades)
  const status = resolve(pick)
  if (player.status === status) return null

  const entry: UndoEntry = {
    playerId,
    prevStatus: player.status,
    prevDraftedAtPick: player.draftedAtPick,
    nextStatus: status,
    at: Date.now(),
  }
  const players = session.players.map((p) =>
    p.id === playerId
      ? {
          ...p,
          status,
          // Keep the original pick when only switching drafted <-> mine.
          draftedAtPick: status === 'available' ? null : (p.draftedAtPick ?? pick),
        }
      : p,
  )
  return { ...session, players, undoStack: [...session.undoStack, entry].slice(-UNDO_LIMIT) }
}

/**
 * Sessions saved before managers existed still need to open. Anything absent gets
 * a sane default rather than crashing the board mid-draft.
 */
function migrate(session: Session): Session {
  const managers = defaultManagers(session.leagueSize, session.draftSlot)
  for (let i = 0; i < managers.length; i++) {
    const saved = session.managers?.[i]
    if (saved && saved.trim()) managers[i] = saved
  }
  return {
    ...session,
    managers,
    undoStack: session.undoStack ?? [],
    pickOffset: session.pickOffset ?? 0,
    trades: session.trades ?? [],
    dismissedTierAlerts: session.dismissedTierAlerts ?? [],
  }
}

interface SessionState {
  ready: boolean
  sessions: Session[]
  active: Session | null
  settings: AppSettings

  init: () => Promise<void>
  setSettings: (patch: Partial<AppSettings>) => void

  createSession: (sheet: ParsedSheet, players: Player[], config: NewSessionConfig) => Promise<string>
  openSession: (id: string) => Promise<void>
  closeSession: () => void
  deleteSession: (id: string) => Promise<void>
  importSessionJson: (json: string) => Promise<string>

  markPlayer: (playerId: string, status: PlayerStatus) => void
  /**
   * A plain tap on an available player. The turn is resolved against live state
   * here rather than from a render-time prop, so a burst of quick taps can never
   * attribute a pick to the wrong side.
   */
  tapPlayer: (playerId: string, forceOpposite?: boolean) => void
  /**
   * Add someone the cheat sheet never listed and log them as taken. Returns the
   * new player's id.
   */
  addOffBoardPlayer: (details: {
    firstName: string
    lastName: string
    position: Position
    team: string
  }) => string | null
  undo: () => void
  /**
   * Swap two managers' next `count` selections, as agreed out loud at the table.
   * Only upcoming picks move, so the board behind the clock is never rewritten.
   */
  tradePicks: (slotA: number, slotB: number, count: number) => void
  /** Take back the most recent trade. */
  undoLastTrade: () => void
  nudgePickOffset: (delta: number) => void
  setManagerName: (slot: number, name: string) => void
  dismissTierAlert: (key: string) => void
}

export const useSessionStore = create<SessionState>((set, get) => {
  /** Apply a change to the active session, then autosave. */
  const commit = (mutate: (session: Session) => Session | null) => {
    const active = get().active
    if (!active) return
    const next = mutate(active)
    if (!next) return
    const stamped = { ...next, updatedAt: Date.now() }
    set((state) => ({
      active: stamped,
      sessions: state.sessions.map((s) => (s.id === stamped.id ? stamped : s)),
    }))
    void db.saveSession(stamped)
  }

  return {
    ready: false,
    sessions: [],
    active: null,
    settings: { ...db.loadSettings() },

    async init() {
      const sessions = (await db.listSessions()).map(migrate)
      // Land back on the board if a draft was open when the page went away.
      const lastActiveId = db.loadActiveSessionId()
      const active = lastActiveId ? (sessions.find((s) => s.id === lastActiveId) ?? null) : null
      if (!active) db.saveActiveSessionId(null)
      set({ sessions, active, ready: true })
    },

    setSettings(patch) {
      const settings = { ...get().settings, ...patch }
      db.saveSettings(settings)
      set({ settings })
    },

    async createSession(sheet, players, config) {
      const now = Date.now()
      const session: Session = {
        id: newId(),
        name: config.name,
        createdAt: now,
        updatedAt: now,
        sheetTitle: sheet.sheetTitle,
        sheetDate: sheet.sheetDate,
        leagueSize: config.leagueSize,
        draftSlot: config.draftSlot,
        rosterConfig: config.rosterConfig ?? DEFAULT_ROSTER,
        managers: config.managers ?? defaultManagers(config.leagueSize, config.draftSlot),
        players,
        undoStack: [],
        pickOffset: 0,
        trades: [],
        dismissedTierAlerts: [],
      }
      await db.saveSession(session)
      db.saveActiveSessionId(session.id)
      set((state) => ({ sessions: [session, ...state.sessions], active: session }))
      return session.id
    },

    async openSession(id) {
      const stored = await db.getSession(id)
      if (stored) {
        const session = migrate(stored)
        db.saveActiveSessionId(id)
        set({ active: session })
      }
    },

    closeSession() {
      db.saveActiveSessionId(null)
      set({ active: null })
    },

    async deleteSession(id) {
      await db.deleteSession(id)
      if (db.loadActiveSessionId() === id) db.saveActiveSessionId(null)
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== id),
        active: state.active?.id === id ? null : state.active,
      }))
    },

    async importSessionJson(json) {
      const parsed = JSON.parse(json) as Session
      if (!Array.isArray(parsed?.players)) throw new Error('That file does not look like a Draft Board session.')
      const session: Session = migrate({
        ...parsed,
        id: newId(),
        name: `${parsed.name} (imported)`,
        createdAt: parsed.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        undoStack: parsed.undoStack ?? [],
        pickOffset: parsed.pickOffset ?? 0,
        trades: parsed.trades ?? [],
        dismissedTierAlerts: parsed.dismissedTierAlerts ?? [],
      })
      await db.saveSession(session)
      set((state) => ({ sessions: [session, ...state.sessions] }))
      return session.id
    },

    markPlayer(playerId, status) {
      commit((session) => applyMark(session, playerId, () => status))
    },

    addOffBoardPlayer({ firstName, lastName, position, team }) {
      const active = get().active
      if (!active) return null
      const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
      if (!name) return null

      // Sit them after the printed players at their position so sheet ranks are
      // left untouched, and give them an id that cannot collide with a parsed one.
      const nextRank =
        active.players.reduce((max, p) => (p.position === position ? Math.max(max, p.rank) : max), 0) + 1
      const player: Player = {
        id: `OTB-${position}-${nextRank}-${Date.now().toString(36)}`,
        position,
        rank: nextRank,
        tier: null,
        name,
        team: team.trim().toUpperCase(),
        adp12: null,
        adpOverall: null,
        risk: null,
        upside: null,
        badges: [],
        status: 'available',
        draftedAtPick: null,
      }

      commit((session) => ({ ...session, players: [...session.players, player] }))
      // Then log it as a pick, so the turn decides whose it is exactly as a tap would.
      get().tapPlayer(player.id)
      return player.id
    },

    tapPlayer(playerId, forceOpposite = false) {
      commit((session) =>
        applyMark(session, playerId, (pick) =>
          statusForTap(isMyTurn(pick, session.leagueSize, session.draftSlot), forceOpposite),
        ),
      )
    },

    undo() {
      commit((session) => {
        const entry = session.undoStack[session.undoStack.length - 1]
        if (!entry) return null
        return {
          ...session,
          players: session.players.map((p) =>
            p.id === entry.playerId
              ? { ...p, status: entry.prevStatus, draftedAtPick: entry.prevDraftedAtPick }
              : p,
          ),
          undoStack: session.undoStack.slice(0, -1),
        }
      })
    },

    tradePicks(slotA, slotB, count) {
      commit((session) => {
        const moment = currentPick(session.players, session.pickOffset)
        const swaps = swapNextPicks(session, slotA, slotB, count, moment)
        if (swaps.length === 0) return null
        return { ...session, trades: [...session.trades, ...swaps] }
      })
    },

    undoLastTrade() {
      commit((session) => {
        if (session.trades.length === 0) return null
        // A trade of two picks records two swaps; both come back together.
        const moment = currentPick(session.players, session.pickOffset)
        const kept = session.trades.slice(0, -1)
        // Refuse to unwind a trade whose picks have already been used, which
        // would move a card that is already on the board.
        const undone = session.trades[session.trades.length - 1]
        const used = session.players.some(
          (p) => p.draftedAtPick === undone.a || p.draftedAtPick === undone.b,
        )
        if (used || moment < 1) return null
        return { ...session, trades: kept }
      })
    },

    nudgePickOffset(delta) {
      commit((session) => {
        const marked = session.players.filter((p) => p.status !== 'available').length
        // Never let the counter fall below pick 1.
        const offset = Math.max(-marked, session.pickOffset + delta)
        return offset === session.pickOffset ? null : { ...session, pickOffset: offset }
      })
    },

    setManagerName(slot, name) {
      commit((session) => {
        const index = slot - 1
        if (index < 0 || index >= session.managers.length) return null
        const managers = [...session.managers]
        managers[index] = name
        return { ...session, managers }
      })
    },

    dismissTierAlert(key) {
      commit((session) =>
        session.dismissedTierAlerts.includes(key)
          ? null
          : { ...session, dismissedTierAlerts: [...session.dismissedTierAlerts, key] },
      )
    },
  }
})

/** Toggle badges from the review screen before a session exists. */
export function toggleBadge(badges: Badge[], badge: Badge): Badge[] {
  return badges.includes(badge) ? badges.filter((b) => b !== badge) : [...badges, badge]
}
