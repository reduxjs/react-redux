import {
  signal as alienSignal,
  computed as alienComputed,
  effect as alienEffect,
  effectScope as alienEffectScope,
  startBatch,
  endBatch,
} from 'alien-signals'
import type {
  SignalEngine,
  ReactiveSignal,
  ReactiveComputed,
  SignalScope,
} from './types'

export const alienEngine: SignalEngine = {
  signal<T>(value: T): ReactiveSignal<T> {
    const s = alienSignal(value)
    return {
      get: () => s(),
      set: (v: T) => s(v),
    }
  },

  computed<T>(fn: () => T): ReactiveComputed<T> {
    const c = alienComputed(fn)
    return { get: () => c() }
  },

  effect(fn: () => void): void {
    alienEffect(fn)
  },

  batch(fn: () => void): void {
    startBatch()
    try {
      fn()
    } finally {
      endBatch()
    }
  },

  createScope(): SignalScope {
    let dispose: (() => void) | undefined

    return {
      run<T>(fn: () => T): T {
        let result: T
        dispose = alienEffectScope(() => {
          result = fn()
        })
        return result!
      },
      stop(): void {
        dispose?.()
        dispose = undefined
      },
    }
  },
}
