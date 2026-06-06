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
    const nextKeys = Object.keys(next)

    // Detect key additions/removals by comparing length + checking removals
    // (cheaper than building a Set union of both key arrays)
    const prevKeyCount = Object.keys(prev).length
    let keysChanged = prevKeyCount !== nextKeys.length

    // Update the object signal itself (version bump)
    if (parentPath) {
      registry.update(parentPath, next)
    }

    // Iterate next's keys — covers additions + same keys.
    // Removed keys: prev[key] was defined, next[key] is undefined,
    // so prev[key] !== next[key] and the recursive call handles pruning.
    for (let i = 0; i < nextKeys.length; i++) {
      const key = nextKeys[i]
      const childPath = parentPath ? parentPath + '.' + key : key

      // Check if this key was added (not in prev) — also detects keysChanged
      if (!keysChanged && !(key in prev)) {
        keysChanged = true
      }

      if (registry.hasPrefix(childPath)) {
        diffAndUpdateSignals(prev[key], next[key], childPath, registry)
      }
    }

    // Handle removed keys: iterate prev keys that aren't in next
    // Only needed if keys actually changed and there are tracked signals
    if (keysChanged) {
      const keysPath = parentPath ? parentPath + '.@@keys' : '@@keys'
      registry.update(keysPath, nextKeys)

      // Prune signals for removed keys (any key in prev but not in next)
      const prevKeys = Object.keys(prev)
      for (let i = 0; i < prevKeys.length; i++) {
        if (!(prevKeys[i] in next)) {
          const childPath = parentPath
            ? parentPath + '.' + prevKeys[i]
            : prevKeys[i]
          registry.prune(childPath)
        }
      }
    }
    return
  }

  // Both arrays: handle length + index-based diffing
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (parentPath) {
      registry.update(parentPath, next)
    }

    // Length change → @@keys signal + length signal
    if (prev.length !== next.length) {
      const keysPath = parentPath ? parentPath + '.@@keys' : '@@keys'
      registry.update(keysPath, next.length)
      // Also update the explicit 'length' signal for selectors that read .length
      const lengthPath = parentPath ? parentPath + '.length' : 'length'
      registry.update(lengthPath, next.length)
    }

    // Recurse into tracked indices, prune removed ones
    const minLen = Math.min(prev.length, next.length)
    // Shared indices: recurse if tracked
    for (let i = 0; i < minLen; i++) {
      if (prev[i] !== next[i]) {
        const childPath = parentPath ? parentPath + '.' + i : String(i)
        if (registry.hasPrefix(childPath)) {
          diffAndUpdateSignals(prev[i], next[i], childPath, registry)
        }
      }
    }
    // Added indices: recurse if tracked
    for (let i = minLen; i < next.length; i++) {
      const childPath = parentPath ? parentPath + '.' + i : String(i)
      if (registry.hasPrefix(childPath)) {
        diffAndUpdateSignals(undefined, next[i], childPath, registry)
      }
    }
    // Removed indices: prune
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
