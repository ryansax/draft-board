import { useEffect, useState } from 'react'
import type { Player, Session } from '../types'
import { teamLogoUrl, type HeadshotLookup } from '../lib/headshots'
import type { SquadLookup } from '../lib/squad'
import {
  buildOnTheClockAnnouncement,
  buildPickAnnouncement,
  phraseEndTime,
  stripEmoji,
  type Announcement,
} from '../lib/announce'
import { teamFullName } from '../lib/nflTeams'
import { splitName } from '../lib/draft'
import { buildAnalysisContext } from '../lib/analysis'
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
/** Just enough to clear the sting's tail. The voice audio is already fetched. */
const TEASE_TAIL_MS = 120
/** With no timings at all, reveal the card this far into the announcement. */
const FALLBACK_REVEAL_FRACTION = 0.55
/** Silent fallback: roughly how long the line would take to say. */
const MS_PER_CHARACTER = 62
/** How long the card stays up after the voice stops. */
const HOLD_AFTER_MS = 2600

type Stage = 'tease' | 'reveal' | 'done'

/** Who is speaking: which ElevenLabs voice, and how to shade the fallback voice. */
interface Voice {
  apiKey: string
  voiceId: string
  browser: { rate: number; pitch: number }
}

export interface AnnouncementRequest {
  player: Player
  managerName: string
  round: number
  pickInRound: number
  overallPick: number
  nextManagerName: string | null
  /** The whole board, so the analyst has something to reason from. */
  session: Session
}

/**
 * The full-screen "the pick is in" moment. The card lands on the beat the voice
 * finishes the player's name, then hands the screen back to the board.
 */
export default function PickAnnouncement({
  request,
  faces,
  squad,
  apiKey,
  voiceId,
  analystVoiceId,
  analysisKey,
  onFinished,
}: {
  request: AnnouncementRequest
  faces: HeadshotLookup | null
  /** Current roster facts, so the take is not working from stale memory. */
  squad: SquadLookup | null
  apiKey: string
  voiceId: string
  /** Blank falls back to the announcer, which is the old single-voice behaviour. */
  analystVoiceId: string
  /** Anthropic key. Empty means no analysis; the sequence just skips it. */
  analysisKey: string
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

    // Fire the analyst off immediately: the sting and the announcement give it
    // roughly ten seconds of cover, so it is usually ready before the card lands.
    // Aborted on cleanup, so a re-run (StrictMode, or a fast second pick) cannot
    // leave an orphaned request billing away in the background.
    const analysisAbort = new AbortController()
    cleanups.push(() => analysisAbort.abort())

    // Same for the voice fetches: a cancelled run must not leave requests in
    // flight, or StrictMode's double mount bills every line twice.
    const speechAbort = new AbortController()
    cleanups.push(() => speechAbort.abort())

    const analysisPromise = analysisKey.trim()
      ? import('../lib/analysisClient')
          .then((m) =>
            m.requestPickAnalysis(
              buildAnalysisContext(
                request.session,
                request.player,
                request.overallPick,
                squad,
              ),
              analysisKey,
              analysisAbort.signal,
            ),
          )
          .catch(() => null)
      : Promise.resolve(null)

    const announcer: Voice = {
      apiKey,
      voiceId,
      browser: { rate: 0.95, pitch: 1 },
    }
    const analyst: Voice = {
      apiKey,
      voiceId: analystVoiceId.trim() || voiceId,
      // A touch quicker and lower, so the take reads as a second person even
      // when both fall back to the browser's single built-in voice.
      browser: { rate: 1.04, pitch: 0.85 },
    }

    const announcement: Announcement = buildPickAnnouncement(
      request.player,
      request.managerName,
      request.round,
      request.pickInRound,
    )

    // Fetch the announcer's audio NOW, while the sting is still playing. Waiting
    // until the sting ended left a dead gap the length of an ElevenLabs round
    // trip before the voice started.
    const announcementSpeech = prepareSpeech(announcement, announcer, cleanups, speechAbort.signal)

    // Start fetching the take's audio the moment its text arrives — usually while
    // the announcer is still talking — rather than waiting for him to finish.
    const takeSpeechPromise = analysisPromise.then(async (take) =>
      take
        ? {
            take,
            speech: await prepareSpeech(
              { text: take.take, revealAfter: '' },
              analyst,
              cleanups,
              speechAbort.signal,
            ),
          }
        : null,
    )

    const run = async () => {
      // Waiting on the decode first means the real sting plays rather than the
      // fallback on the opening pick.
      await loadSting()
      if (cancelled) return
      playPickSting()
      const teaseMs = Math.max(MIN_TEASE_MS, stingDurationMs() + TEASE_TAIL_MS)

      await wait(teaseMs)
      if (cancelled) return

      // Already fetched, so this starts immediately.
      await (await announcementSpeech).play(() => setStage('reveal'))
      if (cancelled) return

      setStage('reveal')

      // Whatever the analyst has by now; never wait on it.
      const ready = await Promise.race([takeSpeechPromise, wait(2500).then(() => null)])
      if (cancelled) return
      if (ready) {
        await ready.speech.play(() => {})
        if (cancelled) return
      }

      await wait(ready ? 900 : HOLD_AFTER_MS)
      if (cancelled) return

      setLeaving(true)
      await wait(500)
      if (cancelled) return

      if (request.nextManagerName) {
        const onTheClock = await prepareSpeech(
          { text: buildOnTheClockAnnouncement(request.nextManagerName), revealAfter: '' },
          announcer,
          cleanups,
          speechAbort.signal,
        )
        if (cancelled) return
        await onTheClock.play(() => {})
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
  const [first, last] = splitName(player.name)
  // A defence's "headshot" is already its logo; no need for it twice.
  const logo = player.team && player.position !== 'DST' ? teamLogoUrl(player.team) : null

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
          {/* Capped so a long name breaks onto its own lines instead of running
              under the headshot, which starts around 58% across. */}
          <div className="relative z-10 min-w-0 max-w-[62%] flex-1 p-[3vw]">
            <div className="font-display text-[clamp(1.4rem,4.6vw,5.8rem)] leading-[1.02] tracking-[0.01em] uppercase">
              {first && <div className="truncate">{first}</div>}
              <div className="truncate">{last}</div>
            </div>
            <div className="mt-[1.5vh] flex items-center gap-[0.9vw] text-[clamp(0.8rem,1.6vw,2rem)] font-bold opacity-90">
              {logo && (
                <img
                  src={logo}
                  alt=""
                  className="h-[clamp(1.4rem,3vw,3.6rem)] w-auto shrink-0 drop-shadow"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}
              <span className="truncate">
                {positionLabel}
                {player.team ? ` · ${teamFullName(player.team)}` : ''}
              </span>
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

/** A line of speech that has already been fetched and is ready to play. */
interface PreparedSpeech {
  play: (onReveal: () => void) => Promise<void>
}

/**
 * Fetch a line ahead of time so playback can start the instant it is wanted.
 *
 * Splitting fetch from play is the whole point: the announcer's audio is
 * requested while the sting is still ringing, so there is no round trip between
 * the sting ending and the voice starting. Falls back from ElevenLabs to the
 * browser voice to a silent timer — fun mode must never wedge the board.
 */
async function prepareSpeech(
  announcement: Announcement,
  voice: Voice,
  cleanups: Array<() => void>,
  signal?: AbortSignal,
): Promise<PreparedSpeech> {
  // Belt and braces: the builders already strip emoji out of team names, but the
  // analyst's take can quote one back, and no voice reads "🔥" usefully.
  const text = stripEmoji(announcement.text) || announcement.text
  const { revealAfter } = announcement
  const { apiKey, voiceId } = voice

  if (apiKey.trim()) {
    try {
      const { audio, alignment } = await fetchElevenLabsClip(
        text,
        apiKey.trim(),
        voiceId.trim() || DEFAULT_VOICE_ID,
        signal,
      )
      const clip = clipFromAudio(audio, alignment, phraseEndTime)
      cleanups.push(clip.stop)

      return {
        play: async (onReveal) => {
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
            const t = window.setTimeout(
              onReveal,
              text.length * MS_PER_CHARACTER * FALLBACK_REVEAL_FRACTION,
            )
            cleanups.push(() => window.clearTimeout(t))
          }
          await withDeadline(clip.play(), estimateSpeechMs(text))
          onReveal()
        },
      }
    } catch {
      // Fall through to a voice that cannot fail on a network hiccup.
    }
  }

  // The browser voice cannot be fetched ahead of time, but it starts instantly.
  if (browserSpeechAvailable()) {
    return {
      play: async (onReveal) => {
        const revealIndex = revealAfter ? text.toLowerCase().indexOf(revealAfter.toLowerCase()) : -1
        const revealAtChar = revealIndex >= 0 ? revealIndex + revealAfter.length : -1
        const { done, stop } = speakWithBrowser(
          text,
          (charIndex) => {
            if (revealAtChar >= 0 && charIndex >= revealAtChar) onReveal()
          },
          voice.browser,
        )
        cleanups.push(stop)
        // Chrome can accept an utterance and never report it finished.
        await withDeadline(done, estimateSpeechMs(text))
        stop()
        onReveal()
      },
    }
  }

  return {
    play: async (onReveal) => {
      await new Promise<void>((resolve) => {
        const reveal = window.setTimeout(
          onReveal,
          text.length * MS_PER_CHARACTER * FALLBACK_REVEAL_FRACTION,
        )
        const end = window.setTimeout(resolve, text.length * MS_PER_CHARACTER)
        cleanups.push(() => {
          window.clearTimeout(reveal)
          window.clearTimeout(end)
        })
      })
      onReveal()
    },
  }
}
