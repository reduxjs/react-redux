import type { PathSignalRegistry } from './pathSignalRegistry'
import type { SignalEngine } from './types'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/**
 * Walk prev and next state trees, updating path signals for changed values.
 * Exploits Immer's structural sharing: `prev === next` skips entire subtrees.
 */
export function diffAndUpdateSignals(
  prev: unknown,
  next: unknown,
  pathSegments: string[],
  registry: PathSignalRegistry,
): void {
  // Structural sharing: identical references mean nothing changed
  if (prev === next) return

  // Both plain objects: recurse into properties
  if (isPlainObject(prev) && isPlainObject(next)) {
    const prevKeys = Object.keys(prev)
    const nextKeys = Object.keys(next)

    // Check for key changes (additions/removals)
    const keysChanged =
      prevKeys.length !== nextKeys.length ||
      prevKeys.some((k) => !(k in next))

    if (keysChanged) {
      const keysPath = [...pathSegments, '@@keys'].join('.')
      registry.update(keysPath, nextKeys)
    }

    // Update the object signal itself (version bump)
    const selfPath = pathSegments.join('.')
    if (selfPath) {
      registry.update(selfPath, next)
    }

    // Recurse into all keys present in either object
    const allKeys = new Set([...prevKeys, ...nextKeys])
    for (const key of allKeys) {
      diffAndUpdateSignals(prev[key], next[key], [...pathSegments, key], registry)
    }
    return
  }

  // Both arrays: handle length + index-based diffing
  if (Array.isArray(prev) && Array.isArray(next)) {
    const selfPath = pathSegments.join('.')
    if (selfPath) {
      registry.update(selfPath, next)
    }

    // Length change → @@keys signal
    if (prev.length !== next.length) {
      const keysPath = [...pathSegments, '@@keys'].join('.')
      registry.update(keysPath, next.length)
    }

    // Recurse into each index
    const maxLen = Math.max(prev.length, next.length)
    for (let i = 0; i < maxLen; i++) {
      diffAndUpdateSignals(prev[i], next[i], [...pathSegments, String(i)], registry)
    }

    // Prune signals for removed indices
    for (let i = next.length; i < prev.length; i++) {
      registry.prune([...pathSegments, String(i)].join('.'))
    }
    return
  }

  // Leaf value change (primitive, or type mismatch like object→primitive)
  const pathKey = pathSegments.join('.')
  if (pathKey) {
    registry.update(pathKey, next)
  }

  // If prev was an object/array and next is not, prune child signals
  if (
    prev !== null &&
    typeof prev === 'object' &&
    (next === null || typeof next !== 'object')
  ) {
    registry.prune(pathKey)
  }
}

/**
 * Wrapper that batches all signal updates into a single propagation pass.
 */
export function reconcileState(
  prev: unknown,
  next: unknown,
  registry: PathSignalRegistry,
  engine: SignalEngine,
): void {
  engine.batch(() => {
    diffAndUpdateSignals(prev, next, [], registry)
  })
}
