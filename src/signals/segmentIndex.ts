/**
 * A deferred (not-yet-built) useSignalSelector subscriber, registered in
 * the coarse tier. The hook stays in this tier — no tracking proxies, no
 * path signals, no alien-signals effect — until a dispatch changes one of
 * the top-level state keys its selector read at probe time. Then
 * `onCoarseHit` promotes it to the deep (path-signal) tier.
 */
export interface CoarseSub {
  /**
   * Top-level state keys the selector read when probed, recorded as raw
   * (unencoded) key names. `null` means wildcard: the footprint can't be
   * gated (e.g. the selector returned the root state), so the subscriber
   * is hit on every dispatch that changes the root reference.
   */
  segments: Set<string> | null
  /** Promote this subscriber to the deep tier. Called at most once. */
  onCoarseHit(): void
}

/**
 * Inverted index from top-level state key ("segment") to the coarse
 * subscribers whose probed footprint includes that key. Lets the
 * SignalProvider wake only the deferred subscribers that could possibly
 * be affected by a dispatch, using the changed root keys the state diff
 * already computes.
 */
export interface SegmentIndex {
  register(sub: CoarseSub): void
  /** Idempotent: unregistering a sub that isn't registered is a no-op. */
  unregister(sub: CoarseSub): void
  /**
   * Collect subscribers whose footprint intersects the changed root keys.
   * `null` means the root wasn't diffable (non-plain-object root): every
   * subscriber is a candidate. An empty array still returns wildcard
   * subscribers — the root reference changed even if no key did.
   * Returns a snapshot array: subscribers unregister themselves during
   * `onCoarseHit`, so the caller must not iterate live index structures.
   */
  collect(changedRootKeys: readonly string[] | null): readonly CoarseSub[]
  size(): number
}

const EMPTY: readonly CoarseSub[] = []

export function createSegmentIndex(): SegmentIndex {
  const all = new Set<CoarseSub>()
  const bySegment = new Map<string, Set<CoarseSub>>()
  const wildcards = new Set<CoarseSub>()

  return {
    register(sub: CoarseSub): void {
      if (all.has(sub)) return
      all.add(sub)
      if (sub.segments === null) {
        wildcards.add(sub)
        return
      }
      for (const seg of sub.segments) {
        let bucket = bySegment.get(seg)
        if (bucket === undefined) {
          bucket = new Set()
          bySegment.set(seg, bucket)
        }
        bucket.add(sub)
      }
    },

    unregister(sub: CoarseSub): void {
      if (!all.delete(sub)) return
      if (sub.segments === null) {
        wildcards.delete(sub)
        return
      }
      for (const seg of sub.segments) {
        const bucket = bySegment.get(seg)
        if (bucket !== undefined) {
          bucket.delete(sub)
          if (bucket.size === 0) bySegment.delete(seg)
        }
      }
    },

    collect(changedRootKeys: readonly string[] | null): readonly CoarseSub[] {
      if (all.size === 0) return EMPTY
      if (changedRootKeys === null) return Array.from(all)
      if (changedRootKeys.length === 0) {
        return wildcards.size > 0 ? Array.from(wildcards) : EMPTY
      }
      const hits = new Set<CoarseSub>(wildcards)
      for (let i = 0; i < changedRootKeys.length; i++) {
        const bucket = bySegment.get(changedRootKeys[i])
        if (bucket !== undefined) {
          for (const sub of bucket) hits.add(sub)
        }
      }
      return hits.size > 0 ? Array.from(hits) : EMPTY
    },

    size(): number {
      return all.size
    },
  }
}
