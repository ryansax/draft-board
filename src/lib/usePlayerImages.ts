import { useEffect, useState } from 'react'
import { loadHeadshotIndex, saveHeadshotIndex } from './db'
import { createLookup, fetchIndex, isStale, type HeadshotLookup } from './headshots'

/** Shared across every component that asks, so the list is only indexed once. */
let cached: HeadshotLookup | null = null
let inFlight: Promise<HeadshotLookup | null> | null = null

async function resolve(): Promise<HeadshotLookup | null> {
  if (cached) return cached
  const stored = await loadHeadshotIndex()
  if (stored && !isStale(stored)) {
    cached = createLookup(stored.entries)
    return cached
  }
  try {
    const fresh = await fetchIndex()
    await saveHeadshotIndex(fresh)
    cached = createLookup(fresh.entries)
    return cached
  } catch {
    // Offline or the API moved: fall back to a stale cache if we have one.
    if (stored) {
      cached = createLookup(stored.entries)
      return cached
    }
    return null
  }
}

/**
 * Returns a lookup from player to headshot URL, or null while loading / when
 * images are turned off. Never throws: the board must render regardless.
 */
export function usePlayerImages(enabled: boolean): HeadshotLookup | null {
  const [lookup, setLookup] = useState<HeadshotLookup | null>(() => (enabled ? cached : null))

  useEffect(() => {
    if (!enabled) {
      setLookup(null)
      return
    }
    let cancelled = false
    inFlight = inFlight ?? resolve()
    void inFlight.then((result) => {
      inFlight = null
      if (!cancelled) setLookup(() => result)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return lookup
}
