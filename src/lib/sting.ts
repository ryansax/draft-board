/**
 * The "pick is in" alert.
 *
 * Plays the supplied sting from `public/sounds/`, falling back to a synthesised
 * one if the file will not load or play — the room display should never be left
 * silently waiting on an asset.
 */

/**
 * The supplied sting, converted to mp3 and peak-normalised for a room. Imported so
 * the bundler rewrites the URL — a hardcoded "/sounds/..." breaks the moment the
 * app is hosted anywhere but a domain root.
 */
import stingUrl from '../assets/pick-is-in.mp3?url'

const STING_URL = stingUrl

let context: AudioContext | null = null
let stingBuffer: AudioBuffer | null = null
let stingLoad: Promise<AudioBuffer | null> | null = null

function ensureContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined' && typeof (globalThis as any).webkitAudioContext === 'undefined') {
    return null
  }
  if (!context) {
    const Ctor: typeof AudioContext =
      typeof AudioContext !== 'undefined' ? AudioContext : (globalThis as any).webkitAudioContext
    context = new Ctor()
  }
  return context
}

/**
 * Browsers refuse to start audio without a user gesture. Call this from a click so
 * later announcements are allowed to make noise.
 */
export async function unlockAudio(): Promise<boolean> {
  const ctx = ensureContext()
  if (!ctx) return false
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      return false
    }
  }
  if (ctx.state === 'running') void loadSting()
  return ctx.state === 'running'
}

export function audioBlocked(): boolean {
  const ctx = context
  return Boolean(ctx && ctx.state !== 'running')
}

/** One tone with a percussive envelope. */
function blip(
  ctx: AudioContext,
  destination: AudioNode,
  at: number,
  frequency: number,
  duration: number,
  peak: number,
  type: OscillatorType = 'triangle',
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, at)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.connect(gain).connect(destination)
  osc.start(at)
  osc.stop(at + duration + 0.05)
}

/** Fallback length, used only until the real file reports its duration. */
export const STING_DURATION_MS = 1250

/** How long the loaded sting runs, so the visuals can be timed to it. */
export function stingDurationMs(): number {
  return stingBuffer ? Math.round(stingBuffer.duration * 1000) : STING_DURATION_MS
}

/**
 * Fetch and decode the sting. Safe to call repeatedly; resolves null if the file
 * is missing or undecodable, which sends callers to the synthesised alert.
 */
export function loadSting(): Promise<AudioBuffer | null> {
  if (stingBuffer) return Promise.resolve(stingBuffer)
  if (stingLoad) return stingLoad
  const ctx = ensureContext()
  if (!ctx) return Promise.resolve(null)

  stingLoad = (async () => {
    try {
      const response = await fetch(STING_URL)
      if (!response.ok) return null
      stingBuffer = await ctx.decodeAudioData(await response.arrayBuffer())
      return stingBuffer
    } catch {
      return null
    } finally {
      stingLoad = null
    }
  })()
  return stingLoad
}

/** Play the alert. Silently does nothing if audio is unavailable or blocked. */
export function playPickSting(volume = 0.7): void {
  const ctx = ensureContext()
  if (!ctx || ctx.state !== 'running') return

  if (stingBuffer) {
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    gain.gain.value = volume
    source.buffer = stingBuffer
    source.connect(gain).connect(ctx.destination)
    source.start()
    return
  }

  playSynthesisedSting(ctx, Math.min(volume, 0.3))
}

/** The original alert, kept as the fallback when the file is unavailable. */
function playSynthesisedSting(ctx: AudioContext, volume: number): void {
  const master = ctx.createGain()
  master.gain.value = volume
  master.connect(ctx.destination)

  const now = ctx.currentTime + 0.02

  // Low impact: the thump under the alert.
  const impact = ctx.createOscillator()
  const impactGain = ctx.createGain()
  impact.type = 'sine'
  impact.frequency.setValueAtTime(140, now)
  impact.frequency.exponentialRampToValueAtTime(48, now + 0.5)
  impactGain.gain.setValueAtTime(0.0001, now)
  impactGain.gain.exponentialRampToValueAtTime(1, now + 0.02)
  impactGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7)
  impact.connect(impactGain).connect(master)
  impact.start(now)
  impact.stop(now + 0.75)

  // Three rising blips — the "alert" figure.
  blip(ctx, master, now + 0.02, 880, 0.16, 0.55) // A5
  blip(ctx, master, now + 0.20, 1108, 0.16, 0.55) // C#6
  blip(ctx, master, now + 0.38, 1318, 0.42, 0.75) // E6

  // A fifth above the last blip, quieter, to make it ring.
  blip(ctx, master, now + 0.38, 1976, 0.42, 0.22, 'sine')
}
