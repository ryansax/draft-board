import type { Player, Position } from '../types'
import { teamFullName } from './nflTeams'

const ONES = [
  '', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth',
  'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth',
  'seventeenth', 'eighteenth', 'nineteenth',
]
const TENS_CARDINAL = ['', '', 'twenty', 'thirty', 'forty', 'fifty']
const TENS_ORDINAL = ['', '', 'twentieth', 'thirtieth', 'fortieth', 'fiftieth']

/** 5 -> "fifth". Spoken aloud, words beat digits. */
export function ordinalWord(n: number): string {
  if (!Number.isFinite(n) || n < 1) return String(n)
  if (n < 20) return ONES[n]
  if (n < 60) {
    const tens = Math.floor(n / 10)
    const ones = n % 10
    return ones === 0 ? TENS_ORDINAL[tens] : `${TENS_CARDINAL[tens]}-${ONES[ones]}`
  }
  return `${n}th`
}

const POSITION_WORDS: Record<Position, string> = {
  QB: 'quarterback',
  RB: 'running back',
  WR: 'wide receiver',
  TE: 'tight end',
  DST: 'defense',
  K: 'kicker',
}

/*
 * Emoji belong on the board, not in the announcer's mouth. A voice handed "🔥"
 * either reads it out as a word ("fire") or drops it silently, and either way the
 * extra characters shift the alignment the card reveal is timed against.
 */
const EMOJI =
  /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\uFE0F\u200D\u20E3]/gu

/** The same text with emoji taken out and the leftover spacing tidied. */
export function stripEmoji(value: string): string {
  return value.replace(EMOJI, '').replace(/\s+/g, ' ').trim()
}

/**
 * A team name as the announcer should say it. A name that is nothing but emoji
 * would leave a hole in the sentence, so it gets something sayable instead.
 */
export function speakableName(name: string, fallback = 'that team'): string {
  return stripEmoji(name) || fallback
}

export interface Announcement {
  /** What the voice says. */
  text: string
  /** The phrase to watch for; the card appears as it finishes. */
  revealAfter: string
}

/**
 * "With the fifth pick of the second round, Leo's Bus Drivers selects Bijan
 * Robinson. Running back from the Atlanta Falcons."
 */
export function buildPickAnnouncement(
  player: Player,
  managerName: string,
  round: number,
  pickInRound: number,
): Announcement {
  const opening = `With the ${ordinalWord(pickInRound)} pick of the ${ordinalWord(round)} round, ${speakableName(managerName)} selects`

  // A defense is already "<City> <Nickname>"; saying its position twice reads badly.
  if (player.position === 'DST') {
    return { text: `${opening} the ${player.name} defense.`, revealAfter: player.name }
  }

  const from = player.team ? ` from the ${teamFullName(player.team)}` : ''
  return {
    text: `${opening} ${player.name}. ${capitalise(POSITION_WORDS[player.position])}${from}.`,
    revealAfter: lastNameOf(player.name),
  }
}

export function buildOnTheClockAnnouncement(managerName: string): string {
  return `${speakableName(managerName)} is on the clock.`
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** The part of the name the reveal waits for. */
export function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] ?? '')
}

// ---------------------------------------------------------------------------
// Aligning the reveal to the voice
// ---------------------------------------------------------------------------

/** ElevenLabs character-level alignment, as returned by `/with-timestamps`. */
export interface Alignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

/**
 * When the voice finishes saying `phrase`, in seconds. Returns null when the
 * phrase cannot be located, so the caller can fall back to a timed reveal rather
 * than never showing the card.
 */
export function phraseEndTime(alignment: Alignment | null | undefined, phrase: string): number | null {
  if (!alignment?.characters?.length || !phrase.trim()) return null
  const ends = alignment.character_end_times_seconds
  if (!Array.isArray(ends) || ends.length !== alignment.characters.length) return null

  // Compare on letters and digits only: the voice's transcript keeps punctuation
  // and spacing that the name does not.
  const keep: number[] = []
  let haystack = ''
  alignment.characters.forEach((character, index) => {
    const simple = character.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!simple) return
    haystack += simple
    keep.push(index)
  })
  const needle = phrase.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!needle) return null

  const at = haystack.lastIndexOf(needle)
  if (at < 0) return null

  const lastIndex = keep[at + needle.length - 1]
  const end = ends[lastIndex]
  return Number.isFinite(end) ? end : null
}
