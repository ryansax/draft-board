export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'] as const
export type Position = (typeof POSITIONS)[number]

/** Positions that carry ADP / risk / upside / tiers on the cheat sheet. */
export const SKILL_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
export type SkillPosition = (typeof SKILL_POSITIONS)[number]

export const BADGES = [
  'myGuy',
  'sleeper',
  'breakout',
  'value',
  'rookie',
  'bust',
  'injury',
] as const
export type Badge = (typeof BADGES)[number]

export const BADGE_LABELS: Record<Badge, string> = {
  myGuy: 'My Guy',
  sleeper: 'Sleeper',
  breakout: 'Breakout',
  value: 'Value',
  rookie: 'Rookie',
  bust: 'Bust',
  injury: 'Injury Concerns',
}

export type PlayerStatus = 'available' | 'drafted' | 'mine'

export interface Player {
  id: string
  position: Position
  /** Rank within the position, 1-based. */
  rank: number
  /** null for DST and K. */
  tier: number | null
  name: string
  /** Team code, or 'FA'. */
  team: string
  /** Original sheet notation, 12-team round.pick, e.g. "3.06". null when the sheet shows "-". */
  adp12: string | null
  /** Overall pick number derived from adp12. null when adp12 is null. */
  adpOverall: number | null
  /** 1.0-10.0, null for DST/K. */
  risk: number | null
  /** 1.0-10.0, null for DST/K. */
  upside: number | null
  badges: Badge[]
  status: PlayerStatus
  /** Pick number at which this player was marked. */
  draftedAtPick: number | null
}

export interface RosterConfig {
  QB: number
  RB: number
  WR: number
  TE: number
  FLEX: number
  DST: number
  K: number
  BN: number
}

export const DEFAULT_ROSTER: RosterConfig = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  DST: 1,
  K: 1,
  BN: 6,
}

/** Positions eligible for the FLEX slot. */
export const FLEX_POSITIONS: Position[] = ['RB', 'WR', 'TE']

export type LeagueSize = 8 | 10 | 12 | 14
export const LEAGUE_SIZES: LeagueSize[] = [8, 10, 12, 14]

/** Placeholder names so a session is usable before anyone is named. */
export function defaultManagers(leagueSize: number, draftSlot: number): string[] {
  return Array.from({ length: leagueSize }, (_, i) => (i + 1 === draftSlot ? 'Me' : `Team ${i + 1}`))
}

export interface UndoEntry {
  playerId: string
  prevStatus: PlayerStatus
  prevDraftedAtPick: number | null
  nextStatus: PlayerStatus
  at: number
}

export interface Session {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  sheetTitle: string
  /** ISO yyyy-mm-dd parsed from the sheet header, or null. */
  sheetDate: string | null
  leagueSize: LeagueSize
  /** 1..leagueSize */
  draftSlot: number
  /** Manager name per draft slot; index 0 is slot 1. Length equals leagueSize. */
  managers: string[]
  rosterConfig: RosterConfig
  players: Player[]
  undoStack: UndoEntry[]
  /** Manual nudge applied on top of the derived pick counter (section 7.2). */
  pickOffset: number
  /** Tier-run toasts already dismissed, keyed `${position}:${tier}`. */
  dismissedTierAlerts: string[]
}

/** How a position column is ordered. Tier bands only make sense in sheet order. */
export type SortMode = 'rank' | 'adp' | 'upside'

export const SORT_LABELS: Record<SortMode, string> = {
  rank: 'Sheet order',
  adp: 'ADP',
  upside: 'Upside',
}

export interface AppSettings {
  darkMode: boolean
  /** Fetch player headshots from Sleeper's public CDN. */
  playerImages: boolean
  /** Announce each pick out loud on the room display. */
  funMode: boolean
  elevenLabsApiKey: string
  elevenLabsVoiceId: string
  aiParseEnabled: boolean
  anthropicApiKey: string
  hideDrafted: boolean
  sortMode: SortMode
}

export const DEFAULT_SETTINGS: AppSettings = {
  darkMode: false,
  playerImages: true,
  funMode: false,
  elevenLabsApiKey: '',
  elevenLabsVoiceId: '',
  aiParseEnabled: false,
  anthropicApiKey: '',
  hideDrafted: false,
  sortMode: 'rank',
}
