/** The Fantasy Footballers sheet quotes ADP in 12-team round.pick notation. */
export const SHEET_LEAGUE_SIZE = 12

export const ADP_PATTERN = /^\d{1,2}\.\d{2}$/

/**
 * "3.06" -> 30. Returns null for "-", "", null, or anything malformed.
 * Rounds may exceed 20 (the sample sheet contains "34.04").
 */
export function adp12ToOverall(adp12: string | null | undefined): number | null {
  if (!adp12) return null
  const trimmed = adp12.trim()
  if (!ADP_PATTERN.test(trimmed)) return null
  const [roundStr, pickStr] = trimmed.split('.')
  const round = Number(roundStr)
  const pick = Number(pickStr)
  if (round < 1 || pick < 1 || pick > SHEET_LEAGUE_SIZE) return null
  return (round - 1) * SHEET_LEAGUE_SIZE + pick
}

export interface ConvertedAdp {
  round: number
  pick: number
  /** `round.pick` with a zero-padded pick, e.g. "2.02". */
  label: string
}

/** Overall pick number -> round.pick for a league of `leagueSize` teams. */
export function overallToRoundPick(overall: number, leagueSize: number): ConvertedAdp {
  const round = Math.ceil(overall / leagueSize)
  const pick = overall - (round - 1) * leagueSize
  return { round, pick, label: `${round}.${String(pick).padStart(2, '0')}` }
}

/** Full conversion from the sheet's 12-team notation to the session's league size. */
export function convertAdp(
  adp12: string | null | undefined,
  leagueSize: number,
): (ConvertedAdp & { overall: number }) | null {
  const overall = adp12ToOverall(adp12)
  if (overall === null) return null
  return { ...overallToRoundPick(overall, leagueSize), overall }
}

/**
 * ADP is shown as a plain overall pick number, which is what the pick counter
 * counts in and so needs no league-size conversion. The round.pick forms are kept
 * for the tooltip, where the round context is occasionally useful.
 */
export function adpLabel(overall: number | null): string {
  return overall === null ? '-' : String(overall)
}

export function adpTooltip(
  adp12: string | null,
  overall: number | null,
  leagueSize: number,
): string {
  if (overall === null) return 'No ADP on the sheet'
  const parts = [`ADP: pick ${overall} overall`, `${adp12} on the 12-team sheet`]
  if (leagueSize !== SHEET_LEAGUE_SIZE) {
    parts.push(`round ${overallToRoundPick(overall, leagueSize).label} in your ${leagueSize}-team`)
  }
  return parts.join(' · ')
}

// ---------------------------------------------------------------------------
// Snake draft math
// ---------------------------------------------------------------------------

/**
 * Overall pick number owned by `slot` in round `round` of an N-team snake draft.
 * Odd rounds run 1..N, even rounds run N..1.
 */
export function pickForRound(round: number, leagueSize: number, slot: number): number {
  const base = (round - 1) * leagueSize
  return round % 2 === 1 ? base + slot : base + (leagueSize - slot + 1)
}

/** Every pick this slot owns, for rounds 1..rounds. */
export function myPicks(leagueSize: number, slot: number, rounds: number): number[] {
  const picks: number[] = []
  for (let r = 1; r <= rounds; r++) picks.push(pickForRound(r, leagueSize, slot))
  return picks
}

/** The first pick I own at or after `currentPick`, or null once my picks are exhausted. */
export function nextPickAtOrAfter(picks: number[], currentPick: number): number | null {
  for (const p of picks) if (p >= currentPick) return p
  return null
}

// ---------------------------------------------------------------------------
// Availability prediction (section 7.3) and falling value (7.4)
// ---------------------------------------------------------------------------

export const AVAILABILITY_SAFE_DELTA = 5
export const AVAILABILITY_GONE_DELTA = -5
/** Only annotate players within this many picks of my next selection. */
export const AVAILABILITY_WINDOW = 12
/** An available player this far past his ADP counts as falling. */
export const FALLING_VALUE_DELTA = 5

export type Availability = 'safe' | 'coinflip' | 'gone'

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  safe: 'Should be there',
  coinflip: 'Coin flip',
  gone: 'Likely gone',
}

/**
 * Chip for an available player, or null when he has no ADP or sits outside the
 * relevant window (so the deep list stays clean).
 */
export function availabilityFor(adpOverall: number | null, myNextPick: number | null): Availability | null {
  if (adpOverall === null || myNextPick === null) return null
  if (adpOverall > myNextPick + AVAILABILITY_WINDOW) return null
  const delta = adpOverall - myNextPick
  if (delta >= AVAILABILITY_SAFE_DELTA) return 'safe'
  if (delta <= AVAILABILITY_GONE_DELTA) return 'gone'
  return 'coinflip'
}

/** True when the market expected this player gone already. */
export function isFallingValue(adpOverall: number | null, currentPick: number): boolean {
  if (adpOverall === null) return false
  return adpOverall < currentPick - FALLING_VALUE_DELTA
}

/** Sort comparator that puts null ADP last. */
export function byAdpOverall(a: { adpOverall: number | null }, b: { adpOverall: number | null }): number {
  if (a.adpOverall === null && b.adpOverall === null) return 0
  if (a.adpOverall === null) return 1
  if (b.adpOverall === null) return -1
  return a.adpOverall - b.adpOverall
}
