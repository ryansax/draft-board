import { useEffect, useState } from 'react'
import { loadHeadshotIndex, saveHeadshotIndex } from './db'
import { createLookup, fetchIndex, isStale, type HeadshotEntry, type HeadshotLookup } from './headshots'
import { createSquadLookup, type SquadLookup } from './squad'

/** Shared across every component that asks, so the list is only indexed once. */
let cached: HeadshotEntry[] | null = null
let inFlight: Promise<HeadshotEntry[] | null> | null = null

async function resolve(): Promise<HeadshotEntry[] | null> {
  if (cached) return cached
  const stored = await loadHeadshotIndex()
  if (stored && !isStale(stored)) {
    cached = stored.entries
    return cached
  }
  try {
    const fresh = await fetchIndex()
    await saveHeadshotIndex(fresh)
    cached = fresh.entries
    return cached
  } catch {
    // Offline or the API moved: fall back to a stale cache if we have one.
    if (stored) {
      cached = stored.entries
      return cached
    }
    return null
  }
}

/** Load the roster once and hand the caller whatever view of it they asked for. */
function useRosterIndex<T>(enabled: boolean, derive: (entries: HeadshotEntry[]) => T): T | null {
  const [value, setValue] = useState<T | null>(null)

  useEffect(() => {
    if (!enabled) {
      setValue(null)
      return
    }
    let cancelled = false
    inFlight = inFlight ?? resolve()
    void inFlight.then((entries) => {
      inFlight = null
      if (!cancelled) setValue(() => (entries ? derive(entries) : null))
    })
    return () => {
      cancelled = true
    }
    // `derive` is a module-level function in every call site, so it is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return value
}

/**
 * Returns a lookup from player to headshot URL, or null while loading / when
 * images are turned off. Never throws: the board must render regardless.
 */
export function usePlayerImages(enabled: boolean): HeadshotLookup | null {
  return useRosterIndex(enabled, createLookup)
}

/**
 * Current roster facts for the analyst — who a player's teammates actually are
 * and how far into his career he is. Loaded independently of the headshot
 * setting, because the analyst needs the truth whether or not faces are shown.
 */
export function useSquadFacts(enabled: boolean): SquadLookup | null {
  return useRosterIndex(enabled, createSquadLookup)
}
