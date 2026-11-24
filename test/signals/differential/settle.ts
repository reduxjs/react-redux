import type {
  PathSignalRegistry,
  RegistryStats,
} from '../../../src/signals/pathSignalRegistry'

type Counts = RegistryStats & { sweepRecords?: number }

const nonZero = (counts: object) =>
  Object.entries(counts).filter(([, n]) => n !== 0)

export type SettleOutcome =
  | { kind: 'empty'; reconciles: number }
  /** Entries remain after the idle dispatches, but sweeping every held path clears them. */
  | { kind: 'stuck'; reconciles: number; held: Counts }
  /** Entries remain even after sweeping every held path. */
  | { kind: 'leak'; reconciles: number; held: Counts; drained: Counts }

/**
 * After every subscriber is gone, plays up to `maxReconciles` idle
 * dispatches (each one advances the clock, then starts a reconcile) and
 * reports whether the registry and its sweep policy emptied on their own.
 * The policy's own conditions decide every sweep here; nothing is drained
 * until the idle dispatches are used up.
 */
export function settleRegistry(
  registry: PathSignalRegistry,
  advanceClock: () => void,
  maxReconciles: number,
): SettleOutcome {
  let reconciles = 0
  for (;;) {
    const held = registry.debugStatsWithoutSweep()
    if (nonZero(held).length === 0) return { kind: 'empty', reconciles }
    if (reconciles === maxReconciles) {
      const drained = registry.debugStats()
      return nonZero(drained).length === 0
        ? { kind: 'stuck', reconciles, held }
        : { kind: 'leak', reconciles, held, drained }
    }
    advanceClock()
    registry.startReconcile()
    reconciles++
  }
}

/**
 * Idle dispatches a delayed sweep policy needs to sweep and then forget
 * everything it holds. One round is the longer of its largest dispatch
 * delay and the dispatches it takes to pass its time floor. Two rounds
 * cover holding a path and then forgetting its swept record, plus a margin
 * of two.
 */
export function settleBound(
  { maxDispatches, ms }: { maxDispatches: number; ms: number },
  msPerDispatch: number,
): number {
  return Math.max(maxDispatches, Math.ceil(ms / msPerDispatch)) * 2 + 2
}
