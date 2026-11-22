import { alienEngine } from '../../../src/signals/engine'
import type { PathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import {
  createLeafTracker,
  createTrackingProxy,
  finalizeDependencies,
} from '../../../src/signals/trackingProxy'
import { getProxyPath } from '../../../src/signals/proxyIdentity'
import { untrackResult } from '../../../src/signals/untrack'

export const THREW = Symbol('threw')

export interface EngineHook {
  evals: number
  last: unknown
  stop(): void
}

/**
 * Mirrors useSignalSelector's deep tier without React: a computed that runs
 * the selector through a tracking proxy, and an effect that stores its
 * latest value. Dispatch with `reconcileState(prev, next, registry,
 * alienEngine)`; effects run synchronously.
 */
export function mountEngineHook(
  getState: () => object,
  selector: (state: unknown) => unknown,
  registry: PathSignalRegistry,
): EngineHook {
  const hook: EngineHook = { evals: 0, last: undefined, stop: () => {} }
  const scope = alienEngine.createScope()
  scope.run(() => {
    const computed = alienEngine.computed(() => {
      hook.evals++
      const outer = registry.evaluation.tracker
      try {
        const state = getState()
        const leafTracker = createLeafTracker()
        registry.evaluation.tracker = leafTracker
        const proxy = createTrackingProxy(state, '', registry)
        const result = selector(proxy)
        finalizeDependencies(leafTracker, registry)
        return untrackResult(result, (p) => {
          const path = getProxyPath(p)
          if (path !== undefined && (path !== '' || p === result)) {
            registry.getOrCreate(path, p).get()
          }
        })
      } catch (e) {
        return { [THREW]: e }
      } finally {
        registry.evaluation.tracker = outer
      }
    })
    alienEngine.effect(() => {
      hook.last = computed.get()
    })
  })
  hook.stop = () => scope.stop()
  return hook
}
