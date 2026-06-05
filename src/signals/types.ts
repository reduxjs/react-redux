export type PathKey = string // dot-joined: "todos.0.text", "counters.counter1.value"

export interface ReactiveSignal<T> {
  get(): T
  set(value: T): void
}

export interface ReactiveComputed<T> {
  get(): T
}

export interface SignalEngine {
  signal<T>(value: T): ReactiveSignal<T>
  computed<T>(fn: () => T): ReactiveComputed<T>
  effect(fn: () => void): void
  batch(fn: () => void): void
  createScope(): SignalScope
}

export interface SignalScope {
  run<T>(fn: () => T): T
  stop(): void
}
