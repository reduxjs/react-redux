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
  /** A dispatch is starting. Returns the held paths to sweep now. */
  tick(now: number): readonly string[]
  /** Records held, including any history kept for paths already swept. */
  size(): number
  /** Returns every path waiting to be swept and stops holding them. */
  drain(): readonly string[]
}

export type SweepPolicyFactory = () => SweepPolicy

const NOTHING: readonly string[] = []

/** Sweep a path once it has gone `dispatches` dispatches without a read. */
export function fixedDelaySweepPolicy({
  dispatches,
}: {
  dispatches: number
}): SweepPolicyFactory {
  return () => {
    const releasedAt = new Map<string, number>()
    let ticks = 0
    return {
      released(path) {
        releasedAt.set(path, ticks)
      },
      read(path) {
        releasedAt.delete(path)
      },
      tick() {
        ticks++
        if (releasedAt.size === 0) return NOTHING
        const due: string[] = []
        for (const [path, at] of releasedAt) {
          if (at + dispatches <= ticks) {
            releasedAt.delete(path)
            due.push(path)
          }
        }
        return due
      },
      size: () => releasedAt.size,
      drain() {
        const paths = Array.from(releasedAt.keys())
        releasedAt.clear()
        return paths
      },
    }
  }
}

/** Sweep on the first dispatch after the release. */
export const sweepImmediately: SweepPolicyFactory = fixedDelaySweepPolicy({
  dispatches: 1,
})

export const defaultSweepPolicy: SweepPolicyFactory = fixedDelaySweepPolicy({
  dispatches: 16,
})
