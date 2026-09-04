import type { Player, Position } from '../../types'

/** A single text run from pdf.js, in PDF user space (y grows upward). */
export interface TextItem {
  str: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * A painted image XObject with its placed position and size. The cheat sheet's
 * badge glyphs are images, so these are how badges survive extraction.
 */
export interface ImageItem {
  /** Stable identity for the underlying bitmap — equal glyphs share a hash. */
  hash: string
  x: number
  y: number
  width: number
  height: number
}

export interface PageItems {
  pageNumber: number
  items: TextItem[]
  images: ImageItem[]
}

export interface ParseIssue {
  level: 'error' | 'warning'
  message: string
  position?: Position
  rank?: number
  playerId?: string
}

export interface ParsedSheet {
  sheetTitle: string
  /** ISO yyyy-mm-dd, or null when no date was found in the header. */
  sheetDate: string | null
  players: Player[]
  issues: ParseIssue[]
  /** Row text the parser could not interpret; surfaced in the review screen. */
  unparsed: string[]
  /** How many badge glyphs were read off the sheet, for the review screen. */
  badgesFound: number
}
