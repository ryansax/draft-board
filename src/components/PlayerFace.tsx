import { useState } from 'react'
import type { Player } from '../types'
import type { HeadshotLookup } from '../lib/headshots'

/**
 * A player's headshot, if we have one. Renders nothing at all when the image is
 * missing or fails to load, so a cell never shows a broken-image box.
 */
export default function PlayerFace({
  player,
  lookup,
  className = '',
}: {
  player: Player
  lookup: HeadshotLookup | null
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const url = lookup?.(player) ?? null
  if (!url || failed) return null

  return (
    <img
      src={url}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={`pointer-events-none shrink-0 object-bottom select-none ${className}`}
    />
  )
}
