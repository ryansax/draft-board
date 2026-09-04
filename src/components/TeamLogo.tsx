import { useState } from 'react'
import { teamLogoUrl } from '../lib/headshots'

/**
 * A club's logo, falling back to its code. Free agents have no logo (the CDN 404s),
 * and neither does an unrecognised code, so the text is the honest default rather
 * than a broken image.
 */
export default function TeamLogo({
  team,
  enabled,
  className = '',
}: {
  team: string
  /** Follows the player-images setting: off means no requests to the CDN. */
  enabled: boolean
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const code = (team ?? '').trim()
  const usable = enabled && code.length > 0 && code.toUpperCase() !== 'FA'

  if (!usable || failed) {
    return (
      <span
        className={`flex items-center justify-center text-[10px] font-semibold text-stone-500 dark:text-stone-400 ${className}`}
      >
        {code || '—'}
      </span>
    )
  }

  return (
    <img
      src={teamLogoUrl(code)}
      alt={code}
      title={code}
      /* Eager: a handful of tiny logos, all on screen the moment they render.
         Lazy-loading them buys nothing and can leave them never fetched. */
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain select-none ${className}`}
    />
  )
}
