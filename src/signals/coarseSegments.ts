// Coarse (top-level) segment tracking — the cheap tier in front of the
// deep path-signal graph.
//
// A `useSignalSelector` doesn't need its full per-path tracking graph built
// at mount; it only needs to know which *top-level* state slices ("segments")
// it reads, so a dispatch can cheaply decide whether the selector could be
// affected at all. Building the expensive deep graph is then deferred until a
// segment the selector actually depends on changes for the first time.
//
// This module provides the two primitives for that tier:
//   - `recordSegments` — runs a selector through a shallow proxy that records
//     only top-level property access, returning the set of segment names.
//   - `SegmentIndex` — an inverted index `segment -> Set<subscriber>` used to
//     collect the subscribers a given dispatch could affect.

/**
 * A subscriber the coarse tier can index by segment. Kept intentionally
 * minimal — the index only needs identity and the current segment set.
 */
export interface CoarseSub {
  /** Top-level state segments this subscriber currently depends on. */
  segments: Set<string>
}

/**
 * Run `selector` against a shallow proxy of `state` and return the set of
 * top-level segment names it accessed. Nested values are returned raw (the
 * proxy only traps the root), so tracking stays O(1)-ish per selector — no
 * deep proxy tree is built. The selector's return value is discarded; only
 * the access footprint matters. A throwing selector still yields whatever
 * segments it touched before throwing.
 * @param state - The current (raw) root state object
 * @param selector - The selector to probe
 * @returns The set of accessed top-level segment names
 */
export function recordSegments<S extends object>(
  state: S,
  selector: (state: S) => unknown,
): Set<string> {
  const segments = new Set<string>()
  const proxy = new Proxy(state, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') segments.add(prop)
      return Reflect.get(target, prop, receiver)
    },
  })
  try {
    selector(proxy as S)
  } catch {
    // Ignore: the segments accessed before the throw are still a valid
    // (over-approximate) footprint, and re-running against real state is
    // where an error is surfaced.
  }
  return segments
}

/**
 * Inverted index mapping a top-level state segment to the subscribers that
 * depend on it. Over-approximate by design: a subscriber is collected if any
 * of its segments changed, and the deep tier (or a raw re-run) decides
 * whether it truly needs to update — so we never miss an update, we only ever
 * consider a few extra.
 */
export class SegmentIndex<Sub extends CoarseSub> {
  private readonly bySegment = new Map<string, Set<Sub>>()

  /** Add `sub` under each of its current segments. */
  register(sub: Sub): void {
    for (const segment of sub.segments) {
      let set = this.bySegment.get(segment)
      if (set === undefined) {
        set = new Set()
        this.bySegment.set(segment, set)
      }
      set.add(sub)
    }
  }

  /** Remove `sub` from each of the given segments (its current set by default). */
  unregister(sub: Sub, segments: Iterable<string> = sub.segments): void {
    for (const segment of segments) {
      const set = this.bySegment.get(segment)
      if (set !== undefined) {
        set.delete(sub)
        if (set.size === 0) {
          this.bySegment.delete(segment)
        }
      }
    }
  }

  /**
   * Re-index `sub` after its segment set changed. `sub.segments` must already
   * hold the new set; `prevSegments` is the set it was registered under.
   */
  reindex(sub: Sub, prevSegments: Set<string>): void {
    for (const segment of prevSegments) {
      if (!sub.segments.has(segment)) {
        const set = this.bySegment.get(segment)
        if (set !== undefined) {
          set.delete(sub)
          if (set.size === 0) this.bySegment.delete(segment)
        }
      }
    }
    for (const segment of sub.segments) {
      if (!prevSegments.has(segment)) {
        let set = this.bySegment.get(segment)
        if (set === undefined) {
          set = new Set()
          this.bySegment.set(segment, set)
        }
        set.add(sub)
      }
    }
  }

  /** Add every subscriber of any changed segment into `out`. */
  collect(changedSegments: Iterable<string>, out: Set<Sub>): void {
    for (const segment of changedSegments) {
      const set = this.bySegment.get(segment)
      if (set !== undefined) {
        for (const sub of set) out.add(sub)
      }
    }
  }

  /** Number of indexed segments (for tests/diagnostics). */
  segmentCount(): number {
    return this.bySegment.size
  }
}
