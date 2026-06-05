import type { PathSignalRegistry } from './pathSignalRegistry'
import type { SignalEngine } from './types'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/**
 * Walk prev and next state trees, updating path signals for changed values.
 * Only visits subtrees that have tracked signals (registered paths).
 * Exploits Immer's structural sharing: `prev === next` skips entire subtrees.
 */
export function diffAndUpdateSignals(
  prev: unknown,
  next: unknown,
  parentPath: string,
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
      const keysPath = parentPath ? parentPath + '.@@keys' : '@@keys'
      registry.update(keysPath, nextKeys)
    }

    // Update the object signal itself (version bump)
    if (parentPath) {
      registry.update(parentPath, next)
    }

    // Only recurse into keys that have tracked signals underneath
    const allKeys = new Set([...prevKeys, ...nextKeys])
    for (const key of allKeys) {
      const childPath = parentPath ? parentPath + '.' + key : key
      if (registry.hasPrefix(childPath)) {
        diffAndUpdateSignals(prev[key], next[key], childPath, registry)
      }
    }
    return
  }

  // Both arrays: handle length + index-based diffing
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (parentPath) {
      registry.update(parentPath, next)
    }

    // Length change → @@keys signal
    if (prev.length !== next.length) {
      const keysPath = parentPath ? parentPath + '.@@keys' : '@@keys'
      registry.update(keysPath, next.length)
    }

    // Only recurse into indices that have tracked signals underneath
    const maxLen = Math.max(prev.length, next.length)
    for (let i = 0; i < maxLen; i++) {
      const childPath = parentPath ? parentPath + '.' + i : String(i)
      if (registry.hasPrefix(childPath)) {
        diffAndUpdateSignals(prev?.[i], next?.[i], childPath, registry)
      }
    }

    // Prune signals for removed indices
    for (let i = next.length; i < prev.length; i++) {
      const childPath = parentPath ? parentPath + '.' + i : String(i)
      registry.prune(childPath)
    }
    return
  }

  // Leaf value change (primitive, or type mismatch like object→primitive)
  if (parentPath) {
    registry.update(parentPath, next)
  }

  // If prev was an object/array and next is not, prune child signals
  if (
    prev !== null &&
    typeof prev === 'object' &&
    (next === null || typeof next !== 'object')
  ) {
    registry.prune(parentPath)
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
    diffAndUpdateSignals(prev, next, '', registry)
  })
}
