/**
 * Decides when the prefix-only paths under a released path are removed.
 *
 * A released interior path can sit above prefix-only paths that never got
 * a signal. They have to go eventually or the registry leaks, but
 * sweeping right away is expensive when the path is read again soon:
 * memoized selectors shared between components move a dependency from
 * one component to another, so a path can lose its last subscriber in
 * one dispatch and be read again a few dispatches later, and every such
 * read re-registers the whole subtree.
 *
 * The registry reports events and carries out the sweeps; a policy only
 * decides which held paths to sweep on each dispatch. Policies are pure
 * apart from their own state, so they can be tested against event traces.
 */
export interface SweepPolicy {
  /** `path` lost its last signal and has `weight` tracked paths below it. */
  released(path: string, weight: number, now: number): void
  /** `path` was registered again, as a signal or a prefix-only entry. */
  read(path: string, now: number): void
  /**
   * `path` is no longer registered at all. A policy should drop what it
   * keeps for the path, other than history it uses to learn from sweeps.
   */
  forget(path: string): void
  /** A dispatch is starting. Returns the held paths to sweep now. */
  tick(now: number): readonly string[]
  /** Records held, including any history kept for paths already swept. */
  size(): number
  /** Returns every path waiting to be swept and stops holding them. */
  drain(): readonly string[]
}

export type SweepPolicyFactory = () => SweepPolicy

const NOTHING: readonly string[] = []

export interface DelayedSweepOptions {
  /** Dispatches a released path must go unread before it is swept. */
  dispatches: number
  /** Milliseconds that must also pass, for apps that dispatch very often. */
  ms?: number
  /**
   * When a swept path is read again, its next delay is multiplied by
   * this, up to `maxDispatches`.
   */
  growth?: number
  maxDispatches?: number
}

interface PathRecord {
  /**
   * `held` until swept; `swept` until read again or expired; then `live`
   * until released again or the path is removed.
   */
  state: 'held' | 'swept' | 'live'
  delay: number
  /** Tick of the release, or of the sweep while `swept`. */
  at: number
  time: number
}

/**
 * Sweeps a path once it has gone `dispatches` dispatches (and `ms`
 * milliseconds) without a read. With `growth`, a path read again after
 * its sweep keeps a longer delay for its next release. A swept path that
 * is not read again within one more delay is forgotten, so paths that
 * never return cost a bounded amount.
 */
export function delayedSweepPolicy({
  dispatches,
  ms = 0,
  growth = 1,
  maxDispatches = dispatches,
}: DelayedSweepOptions): SweepPolicyFactory {
  return () => {
    const records = new Map<string, PathRecord>()
    let ticks = 0
    return {
      released(path, _weight, now) {
        const record = records.get(path)
        if (record === undefined) {
          records.set(path, {
            state: 'held',
            delay: dispatches,
            at: ticks,
            time: now,
          })
        } else {
          record.state = 'held'
          record.at = ticks
          record.time = now
        }
      },
      read(path) {
        const record = records.get(path)
        if (record === undefined) return
        if (record.state === 'swept') {
          record.state = 'live'
          record.delay = Math.min(record.delay * growth, maxDispatches)
        } else if (record.delay === dispatches) {
          records.delete(path)
        } else {
          record.state = 'live'
        }
      },
      forget(path) {
        if (records.size === 0) return
        // A swept record has to outlive the sweep that removed its path,
        // since a read after that is what grows the delay. It expires on
        // its own in `tick`.
        if (records.get(path)?.state !== 'swept') records.delete(path)
      },
      tick(now) {
        ticks++
        if (records.size === 0) return NOTHING
        const due: string[] = []
        for (const [path, record] of records) {
          if (record.state === 'live' || record.at + record.delay > ticks) {
            continue
          }
          if (record.state === 'swept') {
            records.delete(path)
          } else if (now - record.time >= ms) {
            due.push(path)
            if (growth === 1) {
              records.delete(path)
            } else {
              record.state = 'swept'
              record.at = ticks
            }
          }
        }
        return due
      },
      size: () => records.size,
      drain() {
        const paths: string[] = []
        for (const [path, record] of records) {
          if (record.state === 'held') paths.push(path)
        }
        records.clear()
        return paths
      },
    }
  }
}

/** Sweep a path once it has gone `dispatches` dispatches without a read. */
export function fixedDelaySweepPolicy({
  dispatches,
}: {
  dispatches: number
}): SweepPolicyFactory {
  return delayedSweepPolicy({ dispatches })
}

/** Sweep on the first dispatch after the release. */
export const sweepImmediately: SweepPolicyFactory = fixedDelaySweepPolicy({
  dispatches: 1,
})

export const defaultSweepPolicy: SweepPolicyFactory = delayedSweepPolicy({
  dispatches: 16,
  ms: 100,
})
