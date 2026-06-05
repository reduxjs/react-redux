import type { PathKey, ReactiveSignal, SignalEngine } from './types'

export interface PathSignalRegistry {
  /** Get or create a signal for a path. Object/array values use version counters. */
  getOrCreate(pathKey: PathKey, currentValue: unknown): ReactiveSignal<unknown>

  /** Update a signal's value (called during diff). */
  update(pathKey: PathKey, newValue: unknown): void

  /** Remove signal for a path and all child paths. */
  prune(pathKey: PathKey): void

  /** Number of active signals. */
  size(): number

  /** Check if a signal exists for a path (without creating one). */
  has(pathKey: PathKey): boolean
}

function isObjectOrArray(v: unknown): v is object {
  return v !== null && typeof v === 'object'
}

export function createPathSignalRegistry(
  engine: SignalEngine,
): PathSignalRegistry {
  const signals = new Map<PathKey, ReactiveSignal<unknown>>()

  return {
    getOrCreate(pathKey: PathKey, currentValue: unknown): ReactiveSignal<unknown> {
      let sig = signals.get(pathKey)
      if (!sig) {
        // For objects/arrays, store a version counter rather than the object itself.
        // The actual value is always read from the frozen state.
        // The signal's purpose is dependency tracking + change notification.
        const initialValue = isObjectOrArray(currentValue) ? 0 : currentValue
        sig = engine.signal(initialValue)
        signals.set(pathKey, sig)
      }
      return sig
    },

    update(pathKey: PathKey, newValue: unknown): void {
      const sig = signals.get(pathKey)
      if (!sig) return // no one is tracking this path — skip

      if (isObjectOrArray(newValue)) {
        // Bump version counter — signals something in this subtree changed
        sig.set((sig.get() as number) + 1)
      } else {
        sig.set(newValue)
      }
    },

    prune(pathKey: PathKey): void {
      const prefix = pathKey + '.'
      for (const key of signals.keys()) {
        if (key === pathKey || key.startsWith(prefix)) {
          signals.delete(key)
        }
      }
    },

    size(): number {
      return signals.size
    },

    has(pathKey: PathKey): boolean {
      return signals.has(pathKey)
    },
  }
}
