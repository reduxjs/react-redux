/**
 * Minimal SignalEngine stub for benchmarking.
 * Signals store values but don't propagate — we measure diff cost, not signal propagation.
 */
import type { SignalEngine, ReactiveSignal, SignalScope } from '../../../src/signals/types'

let updateCount = 0

export function resetUpdateCount(): void {
  updateCount = 0
}

export function getUpdateCount(): number {
  return updateCount
}

function createBenchSignal<T>(value: T): ReactiveSignal<T> {
  let current = value
  return {
    get(): T {
      return current
    },
    set(v: T): void {
      current = v
      updateCount++
    },
  }
}

export const benchEngine: SignalEngine = {
  signal<T>(value: T): ReactiveSignal<T> {
    return createBenchSignal(value)
  },
  computed<T>(fn: () => T) {
    return { get: fn }
  },
  effect(_fn: () => void): void {
    // no-op
  },
  batch(fn: () => void): void {
    fn()
  },
  createScope(): SignalScope {
    return {
      run<T>(fn: () => T): T {
        return fn()
      },
      stop(): void {},
    }
  },
}
