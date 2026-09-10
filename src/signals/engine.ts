import {
  signal as createSignal,
  computed as createComputed,
  effect as createEffect,
  effectScope as createEffectScope,
  startBatch,
  endBatch,
} from './reactiveSystem'
import type { SignalOwner } from './reactiveSystem'
import type {
  SignalEngine,
  ReactiveSignal,
  ReactiveComputed,
  SignalScope,
} from './types'

/**
 * The engine backing `pathSignalRegistry` and `reconcileState`, built on
 * the vendored reactive layer in `./reactiveSystem`.
 *
 * This is internal-only and is not part of the public API. It exists as
 * an injection seam: the reconcile benchmark substitutes a
 * no-propagation stub to measure pure diff cost, and unit tests use
 * `createScope` to contain effects. Application code always gets this
 * implementation.
 *
 * `signal` and `computed` return the graph nodes directly. The nodes
 * implement `get`/`set` themselves, so unlike the previous wrapper over
 * `alien-signals`' bound-function API there is no per-signal wrapper
 * object or closure pair to allocate — which matters because one node
 * exists per tracked state path.
 */
export const alienEngine: SignalEngine = {
  signal<T>(value: T, owner?: SignalOwner, path?: string): ReactiveSignal<T> {
    return createSignal(value, owner, path)
  },

  computed<T>(fn: () => T): ReactiveComputed<T> {
    return createComputed(fn)
  },

  effect(fn: () => void): () => void {
    return createEffect(fn)
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
        dispose = createEffectScope(() => {
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
