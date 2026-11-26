import { alienEngine } from '../../../src/signals/engine'
import {
  createPathSignalRegistry,
  type PathSignalRegistry,
  type RegistryStats,
} from '../../../src/signals/pathSignalRegistry'
import { createTrackingProxy } from '../../../src/signals/trackingProxy'

export function createRegistry(): PathSignalRegistry {
  return createPathSignalRegistry(alienEngine)
}

/** A fresh registry and a root tracking proxy over `state`. */
export function trackState<T extends object>(state: T) {
  const registry = createRegistry()
  const proxy = createTrackingProxy(state, '', registry)
  return { registry, proxy }
}

/** A registry whose signals were created by running `select` once through a
 *  tracking proxy over `state`. */
export function setupRegistry<T extends object>(
  state: T,
  select: (state: T) => unknown,
): PathSignalRegistry {
  const { registry, proxy } = trackState(state)
  select(proxy)
  return registry
}

/** `debugStats()` of a registry that holds nothing. */
export const EMPTY_STATS: RegistryStats = {
  signals: 0,
  prefixCounts: 0,
  prefixOnlyPaths: 0,
  childIndex: 0,
  arrays: 0,
  columns: 0,
  structures: 0,
  segmentSubs: 0,
}
