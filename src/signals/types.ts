import type { SignalOwner } from './reactiveSystem'

export type PathKey = string // dot-joined: "todos.0.text", "counters.counter1.value"

export interface ReactiveSignal<T> {
  get(): T
  set(value: T): void
}

export interface ReactiveComputed<T> {
  get(): T
}

export interface SignalEngine {
  /**
   * Create a signal. When `owner` and `path` are supplied, the signal
   * calls `owner.release(path, node)` as soon as it loses its last
   * subscriber, which is how `pathSignalRegistry` drops a path once no
   * mounted component watches it.
   */
  signal<T>(value: T, owner?: SignalOwner, path?: string): ReactiveSignal<T>
  computed<T>(fn: () => T): ReactiveComputed<T>
  /** Create an effect. Returns a dispose function that stops it. */
  effect(fn: () => void): () => void
  batch(fn: () => void): void
  createScope(): SignalScope
}

export interface SignalScope {
  run<T>(fn: () => T): T
  stop(): void
}
