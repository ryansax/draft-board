import { stripEmoji } from './announce'
import type { Alignment } from './announce'

/**
 * Spoken announcements for the room display.
 *
 * ElevenLabs is preferred because its `/with-timestamps` endpoint returns
 * character-level timings, which is the only way to reveal the card at the exact
 * moment the voice finishes the player's name. Without a key we fall back to the
 * browser's own speech synthesis, whose `boundary` events give word-level timing —
 * less precise, but it keeps fun mode working out of the box.
 */

/**
 * Chrome's speechSynthesis can accept an utterance and never fire `onend`,
 * especially in a background tab — which the room display usually is. Every
 * spoken line therefore runs against a deadline so the sequence cannot hang.
 */
const SPEECH_MS_PER_CHAR = 80
const SPEECH_DEADLINE_CUSHION_MS = 3000

export function estimateSpeechMs(text: string): number {
  return text.length * SPEECH_MS_PER_CHAR + SPEECH_DEADLINE_CUSHION_MS
}

/** Resolve when `promise` settles, or after `ms`, whichever comes first. */
export function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(null)
    }, ms)
    void promise
      .then((value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(null)
      })
  })
}

const API = 'https://api.elevenlabs.io/v1/text-to-speech'
/** "Rachel" — a stock voice on every ElevenLabs account. */
export const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'
const MODEL_ID = 'eleven_turbo_v2_5'

export interface SpokenClip {
  play: () => Promise<void>
  /** Seconds into the clip, or null if the phrase could not be located. */
  endTimeOf: (phrase: string) => number | null
  /** Current playback position in seconds. */
  currentTime: () => number
  stop: () => void
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

export interface ElevenLabsResponse {
  audio_base64?: string
  alignment?: Alignment | null
  normalized_alignment?: Alignment | null
}

/** Request speech with character timings. Throws so the caller can fall back. */
export async function fetchElevenLabsClip(
  text: string,
  apiKey: string,
  voiceId: string,
  signal?: AbortSignal,
): Promise<{ audio: Blob; alignment: Alignment | null }> {
  const response = await fetch(`${API}/${encodeURIComponent(voiceId)}/with-timestamps`, {
    method: 'POST',
    signal,
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL_ID }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`ElevenLabs ${response.status}: ${detail.slice(0, 200)}`)
  }
  const body = (await response.json()) as ElevenLabsResponse
  if (!body.audio_base64) throw new Error('ElevenLabs returned no audio')
  return {
    audio: base64ToBlob(body.audio_base64, 'audio/mpeg'),
    alignment: body.alignment ?? body.normalized_alignment ?? null,
  }
}

/** Wrap an audio blob and its alignment as a playable clip. */
export function clipFromAudio(
  audio: Blob,
  alignment: Alignment | null,
  findEnd: (alignment: Alignment | null, phrase: string) => number | null,
): SpokenClip {
  const url = URL.createObjectURL(audio)
  const element = new Audio(url)
  element.preload = 'auto'
  return {
    play: () =>
      new Promise<void>((resolve, reject) => {
        element.onended = () => resolve()
        element.onerror = () => reject(new Error('Announcement audio failed to play'))
        void element.play().catch(reject)
      }),
    endTimeOf: (phrase) => findEnd(alignment, phrase),
    currentTime: () => element.currentTime,
    stop: () => {
      element.pause()
      URL.revokeObjectURL(url)
    },
  }
}

/**
 * Browser speech synthesis. `boundary` events fire per word, so the reveal lands
 * on the right word even though there is no audio timeline to seek.
 */
export function speakWithBrowser(
  text: string,
  onBoundaryCharIndex: (charIndex: number) => void,
  tuning: { rate?: number; pitch?: number } = {},
): { done: Promise<void>; stop: () => void } {
  if (typeof speechSynthesis === 'undefined') {
    return { done: Promise.resolve(), stop: () => {} }
  }
  const utterance = new SpeechSynthesisUtterance(text)
  // Shifted per speaker so the announcer and the analyst stay distinguishable
  // even on the built-in voice, which offers no second voice to pick.
  utterance.rate = tuning.rate ?? 0.95
  utterance.pitch = tuning.pitch ?? 1

  // Chrome pauses long utterances in background tabs; nudging it keeps them going.
  const keepAlive = window.setInterval(() => {
    if (speechSynthesis.speaking) speechSynthesis.resume()
  }, 5000)

  const done = new Promise<void>((resolve) => {
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
  }).finally(() => window.clearInterval(keepAlive))

  utterance.onboundary = (event) => onBoundaryCharIndex(event.charIndex)
  speechSynthesis.cancel()
  speechSynthesis.speak(utterance)
  return {
    done,
    stop: () => {
      window.clearInterval(keepAlive)
      speechSynthesis.cancel()
    },
  }
}

export function browserSpeechAvailable(): boolean {
  return typeof speechSynthesis !== 'undefined'
}

/**
 * Say one line and resolve when it has finished.
 *
 * The pick announcement fetches its audio well ahead of playing it, because a
 * round trip in the middle of the sequence is audible. A trade alert has no such
 * choreography to protect — it just needs saying — so this is the plain version,
 * falling back from ElevenLabs to the browser voice to a timer that waits roughly
 * as long as the words would have taken.
 */
export async function speakLine(
  text: string,
  apiKey: string,
  voiceId: string,
  signal?: AbortSignal,
): Promise<void> {
  const spoken = stripEmoji(text)
  if (!spoken) return

  if (apiKey.trim()) {
    try {
      const { audio, alignment } = await fetchElevenLabsClip(
        spoken,
        apiKey.trim(),
        voiceId.trim() || DEFAULT_VOICE_ID,
        signal,
      )
      const clip = clipFromAudio(audio, alignment, () => null)
      try {
        await withDeadline(clip.play(), estimateSpeechMs(spoken) + 4000)
      } finally {
        clip.stop()
      }
      return
    } catch {
      // Fall through to the browser voice rather than going silent.
    }
  }

  if (browserSpeechAvailable()) {
    const { done, stop } = speakWithBrowser(spoken, () => {})
    try {
      await withDeadline(done, estimateSpeechMs(spoken) + 4000)
    } finally {
      stop()
    }
    return
  }

  await new Promise((resolve) => setTimeout(resolve, estimateSpeechMs(spoken)))
}
