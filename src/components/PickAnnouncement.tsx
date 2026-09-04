import { useEffect, useState } from 'react'
import type { Player } from '../types'
import type { HeadshotLookup } from '../lib/headshots'
import {
  buildOnTheClockAnnouncement,
  buildPickAnnouncement,
  phraseEndTime,
  type Announcement,
} from '../lib/announce'
import { teamFullName } from '../lib/nflTeams'
import {
  browserSpeechAvailable,
  clipFromAudio,
  estimateSpeechMs,
  fetchElevenLabsClip,
  speakWithBrowser,
  withDeadline,
  DEFAULT_VOICE_ID,
} from '../lib/speech'
import PlayerFace from './PlayerFace'
import { POSITION_COLORS } from './ui'
import { loadSting, playPickSting, stingDurationMs } from '../lib/sting'

/** The banner holds for the length of the sting, so the voice never talks over it. */
const MIN_TEASE_MS = 1600
const TEASE_TAIL_MS = 250
/** With no timings at all, reveal the card this far into the announcement. */
const FALLBACK_REVEAL_FRACTION = 0.55
/** Silent fallback: roughly how long the line would take to say. */
const MS_PER_CHARACTER = 62
/** How long the card stays up after the voice stops. */
const HOLD_AFTER_MS = 2600

type Stage = 'tease' | 'reveal' | 'done'

export interface AnnouncementRequest {
  player: Player
  managerName: string
  round: number
  pickInRound: number
  nextManagerName: string | null
}

/**
 * The full-screen "the pick is in" moment. The card lands on the beat the voice
 * finishes the player's name, then hands the screen back to the board.
 */
export default function PickAnnouncement({
  request,
  faces,
  apiKey,
  voiceId,
  onFinished,
}: {
  request: AnnouncementRequest
  faces: HeadshotLookup | null
  apiKey: string
  voiceId: string
  onFinished: () => void
}) {
  const [stage, setStage] = useState<Stage>('tease')
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    /*
     * Local to this effect invocation, deliberately not a ref. A ref is shared
     * across invocations, so a later run resetting it to false would resurrect an
     * earlier run that cleanup had already cancelled — which played the whole
     * announcement twice under StrictMode's mount/unmount/mount.
     */
    let cancelled = false
    const timers: number[] = []
    const cleanups: Array<() => void> = []

    const wait = (ms: number) =>
      new Promise<void>((resolve) => timers.push(window.setTimeout(resolve, ms)))

    const run = async () => {
      // The alert lands with the banner, not after it. Waiting on the decode first
      // means the real sting plays rather than the fallback on the opening pick.
      await loadSting()
      if (cancelled) return
      playPickSting()
      const teaseMs = Math.max(MIN_TEASE_MS, stingDurationMs() + TEASE_TAIL_MS)

      const announcement: Announcement = buildPickAnnouncement(
        request.player,
        request.managerName,
        request.round,
        request.pickInRound,
      )

      await wait(teaseMs)
      if (cancelled) return

      await speak(announcement, () => setStage('reveal'), apiKey, voiceId, cleanups)
      if (cancelled) return

      setStage('reveal')
      await wait(HOLD_AFTER_MS)
      if (cancelled) return

      setLeaving(true)
      await wait(500)
      if (cancelled) return

      if (request.nextManagerName) {
        await speak(
          { text: buildOnTheClockAnnouncement(request.nextManagerName), revealAfter: '' },
          () => {},
          apiKey,
          voiceId,
          cleanups,
        )
      }
    }

    // The board must return whatever the audio does, so this is not conditional
    // on the sequence reaching its end cleanly.
    void run().finally(() => {
      if (!cancelled) onFinished()
    })
    return () => {
      cancelled = true
      timers.forEach((t) => window.clearTimeout(t))
      cleanups.forEach((stop) => stop())
    }
    // A new request restarts the sequence; the fields are read at run time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  const { player } = request
  const positionLabel = player.position === 'DST' ? 'Defense' : player.position

  return (
    <div
      className={`presentation-root fixed inset-0 z-50 flex flex-col items-center justify-center bg-white transition-opacity duration-500 ${
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      {/* The headline is the alert — no "breaking" label needed in a draft. */}
      <div className="w-[86vw] max-w-6xl">
        <div className="anim-sweep anim-shine relative flex items-center justify-center overflow-hidden rounded-[0.6vw] bg-stone-900 px-[2vw] py-[1.6vh] shadow-lg">
          <span className="anim-live-dot mr-[1.2vw] h-[1vw] w-[1vw] shrink-0 rounded-full bg-red-600" />
          <span className="font-display text-[clamp(1.2rem,4.4vw,5.6rem)] leading-none tracking-[0.02em] text-white">
            THE PICK IS IN
          </span>
        </div>
        <div
          className="anim-sweep mt-[0.5vh] h-[0.5vh] rounded-full bg-red-600"
          style={{ animationDelay: '0.2s' }}
        />

        <div
          className="anim-rise mt-[1.4vh] text-center font-display text-[clamp(0.75rem,1.7vw,2.2rem)] tracking-[0.12em] text-stone-500 uppercase"
          style={{ animationDelay: '0.35s' }}
        >
          Round {request.round} · Pick {request.pickInRound} · {request.managerName}
        </div>
      </div>

      <div
        className={`mt-[3vh] transition-all duration-500 ${
          stage === 'tease' ? 'scale-90 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <div
          className={`relative flex h-[34vh] w-[62vw] max-w-5xl items-center overflow-hidden rounded-[1.4vw] text-white shadow-2xl ${
            POSITION_COLORS[player.position]
          }`}
        >
          <div className="relative z-10 min-w-0 flex-1 p-[3vw]">
            <div className="font-display text-[clamp(1.4rem,4.6vw,5.8rem)] leading-[1.02] tracking-[0.01em] uppercase">
              {player.name}
            </div>
            <div className="mt-[1.5vh] text-[clamp(0.8rem,1.6vw,2rem)] font-bold opacity-90">
              {positionLabel}
              {player.team ? ` · ${teamFullName(player.team)}` : ''}
            </div>
          </div>
          <PlayerFace
            player={player}
            lookup={faces}
            className="absolute right-0 bottom-0 h-[104%] w-auto max-w-none translate-x-[14%]"
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Say a line, calling `onReveal` as the watched phrase finishes. Tries ElevenLabs,
 * then the browser voice, then a silent timer — fun mode must never wedge the board.
 */
async function speak(
  announcement: Announcement,
  onReveal: () => void,
  apiKey: string,
  voiceId: string,
  cleanups: Array<() => void>,
): Promise<void> {
  const { text, revealAfter } = announcement

  if (apiKey.trim()) {
    try {
      const { audio, alignment } = await fetchElevenLabsClip(
        text,
        apiKey.trim(),
        voiceId.trim() || DEFAULT_VOICE_ID,
      )
      const clip = clipFromAudio(audio, alignment, phraseEndTime)
      cleanups.push(clip.stop)

      const revealAt = revealAfter ? clip.endTimeOf(revealAfter) : null
      if (revealAt !== null) {
        let frame = 0
        const watch = () => {
          if (clip.currentTime() >= revealAt) return onReveal()
          frame = requestAnimationFrame(watch)
        }
        frame = requestAnimationFrame(watch)
        cleanups.push(() => cancelAnimationFrame(frame))
      } else if (revealAfter) {
        // No timings came back: reveal partway rather than not at all.
        const t = window.setTimeout(onReveal, text.length * MS_PER_CHARACTER * FALLBACK_REVEAL_FRACTION)
        cleanups.push(() => window.clearTimeout(t))
      }

      await withDeadline(clip.play(), estimateSpeechMs(text))
      onReveal()
      return
    } catch {
      // Fall through to a voice that cannot fail on a network hiccup.
    }
  }

  if (browserSpeechAvailable()) {
    const revealIndex = revealAfter ? text.toLowerCase().indexOf(revealAfter.toLowerCase()) : -1
    const revealAtChar = revealIndex >= 0 ? revealIndex + revealAfter.length : -1
    const { done, stop } = speakWithBrowser(text, (charIndex) => {
      if (revealAtChar >= 0 && charIndex >= revealAtChar) onReveal()
    })
    cleanups.push(stop)
    // Chrome can accept an utterance and never report it finished.
    await withDeadline(done, estimateSpeechMs(text))
    stop()
    onReveal()
    return
  }

  await new Promise<void>((resolve) => {
    const reveal = window.setTimeout(onReveal, text.length * MS_PER_CHARACTER * FALLBACK_REVEAL_FRACTION)
    const end = window.setTimeout(resolve, text.length * MS_PER_CHARACTER)
    cleanups.push(() => {
      window.clearTimeout(reveal)
      window.clearTimeout(end)
    })
  })
  onReveal()
}
