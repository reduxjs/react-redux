import type { ArrayMeta } from './arrayKeys'
import type { ProxyCache } from './trackingProxy'
import type { PathKey, ReactiveSignal, SignalEngine } from './types'

export interface PathSignalRegistry {
  /** Get or create a signal for a path. Object/array values use version counters. */
  getOrCreate(pathKey: PathKey, currentValue: unknown): ReactiveSignal<unknown>

  /** Register a path in the prefix index without creating a signal.
   *  Used for intermediate object traversals where we need hasPrefix()
   *  to work for diff, but don't need a signal (no reactive dependency). */
  ensurePrefix(pathKey: PathKey): void

  /** Update a signal's value (called during diff). */
  update(pathKey: PathKey, newValue: unknown): void

  /** Remove signal for a path and all child paths.
   *  Uses a parent→children index for O(subtree) instead of O(total signals). */
  prune(pathKey: PathKey): void

  /** Number of active signals. */
  size(): number

  /** Check if a signal exists for a path (without creating one). */
  has(pathKey: PathKey): boolean

  /** Check if any tracked signal exists at or below this path prefix. */
  hasPrefix(prefix: string): boolean

  /** Proxy cache for reusing proxies across evaluations (keyed by object identity). */
  proxyCache: ProxyCache

  /** Get array metadata for identity-based tracking at a given path. */
  getArrayMeta(arrayPath: string): ArrayMeta | undefined

  /** Set/update array metadata for identity-based tracking. */
  setArrayMeta(arrayPath: string, meta: ArrayMeta): void
}

function isObjectOrArray(v: unknown): v is object {
  return v !== null && typeof v === 'object'
}

// Increment prefix counters for all ancestor paths of a given pathKey.
// e.g., "a.b.c" increments counters for "a.b.c", "a.b", "a"
function incrementPrefixes(
  prefixCounts: Map<string, number>,
  pathKey: string,
): void {
  prefixCounts.set(pathKey, (prefixCounts.get(pathKey) || 0) + 1)
  let idx = pathKey.lastIndexOf('.')
  while (idx !== -1) {
    const prefix = pathKey.substring(0, idx)
    prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1)
    idx = prefix.lastIndexOf('.')
  }
}

function decrementPrefixes(
  prefixCounts: Map<string, number>,
  pathKey: string,
): void {
  let count = prefixCounts.get(pathKey)
  if (count !== undefined) {
    if (count <= 1) prefixCounts.delete(pathKey)
    else prefixCounts.set(pathKey, count - 1)
  }
  let idx = pathKey.lastIndexOf('.')
  while (idx !== -1) {
    const prefix = pathKey.substring(0, idx)
    count = prefixCounts.get(prefix)
    if (count !== undefined) {
      if (count <= 1) prefixCounts.delete(prefix)
      else prefixCounts.set(prefix, count - 1)
    }
    idx = prefix.lastIndexOf('.')
  }
}

export function createPathSignalRegistry(
  engine: SignalEngine,
): PathSignalRegistry {
  const signals = new Map<PathKey, ReactiveSignal<unknown>>()
  // Prefix counter map: for each path prefix, how many tracked signals
  // exist at or below that prefix. Enables O(1) hasPrefix lookups.
  const prefixCounts = new Map<string, number>()
  // Paths that are prefix-only registered (no signal created yet).
  // Tracked so ensurePrefix is idempotent and getOrCreate can skip
  // re-incrementing prefixes if ensurePrefix was called first.
  const prefixOnlyPaths = new Set<string>()
  // Parent→children index: maps each path to its direct children.
  // Enables O(subtree) prune instead of O(total signals) linear scan.
  const childIndex = new Map<string, Set<string>>()
  // Proxy cache: keyed by target object identity.
  // Reuses proxies for unchanged Immer subtrees across state snapshots.
  const proxyWeakMap: ProxyCache = new WeakMap()
  // Per-array metadata for identity-based tracking.
  // Maps array path → ArrayMeta (keyField + entityMap).
  const arrayMetas = new Map<string, ArrayMeta>()

  // Register a path in the parent→children index.
  // Only links to immediate parent: "a.b.c" → childIndex["a.b"].add("a.b.c")
  // Ancestors are already linked by their own registrations:
  // when "a.b" was registered, childIndex["a"].add("a.b") was called.
  function addToChildIndex(pathKey: string): void {
    const idx = pathKey.lastIndexOf('.')
    if (idx === -1) return // root-level path, no parent
    const parent = pathKey.substring(0, idx)
    let children = childIndex.get(parent)
    if (!children) {
      children = new Set()
      childIndex.set(parent, children)
    }
    children.add(pathKey)
  }

  return {
    getOrCreate(pathKey: PathKey, currentValue: unknown): ReactiveSignal<unknown> {
      let sig = signals.get(pathKey)
      if (!sig) {
        const initialValue = isObjectOrArray(currentValue) ? 0 : currentValue
        sig = engine.signal(initialValue)
        signals.set(pathKey, sig)
        addToChildIndex(pathKey)
        // If ensurePrefix was called first, prefixes are already counted
        if (prefixOnlyPaths.has(pathKey)) {
          prefixOnlyPaths.delete(pathKey)
        } else {
          incrementPrefixes(prefixCounts, pathKey)
        }
      }
      return sig
    },

    ensurePrefix(pathKey: PathKey): void {
      // Already has a signal or already prefix-registered — nothing to do
      if (signals.has(pathKey) || prefixOnlyPaths.has(pathKey)) return
      prefixOnlyPaths.add(pathKey)
      addToChildIndex(pathKey)
      incrementPrefixes(prefixCounts, pathKey)
    },

    update(pathKey: PathKey, newValue: unknown): void {
      const sig = signals.get(pathKey)
      if (!sig) return

      if (isObjectOrArray(newValue)) {
        const current = sig.get()
        sig.set(typeof current === 'number' ? current + 1 : 0)
      } else {
        sig.set(newValue)
      }
    },

    prune(pathKey: PathKey): void {
      // Recursively remove this path and all descendants using the child index.
      // O(subtree size) instead of O(total signals).
      const stack: string[] = [pathKey]
      while (stack.length > 0) {
        const key = stack.pop()!
        // Push children onto stack before deleting
        const children = childIndex.get(key)
        if (children) {
          for (const child of children) {
            stack.push(child)
          }
          childIndex.delete(key)
        }
        // Remove from signals or prefix-only, and decrement prefix counts
        if (signals.has(key)) {
          signals.delete(key)
          decrementPrefixes(prefixCounts, key)
        } else if (prefixOnlyPaths.has(key)) {
          prefixOnlyPaths.delete(key)
          decrementPrefixes(prefixCounts, key)
        }
      }
      // Remove this path from its parent's child set
      const dotIdx = pathKey.lastIndexOf('.')
      if (dotIdx !== -1) {
        const parent = pathKey.substring(0, dotIdx)
        const parentChildren = childIndex.get(parent)
        if (parentChildren) {
          parentChildren.delete(pathKey)
          if (parentChildren.size === 0) {
            childIndex.delete(parent)
          }
        }
      }
    },

    size(): number {
      return signals.size
    },

    has(pathKey: PathKey): boolean {
      return signals.has(pathKey)
    },

    hasPrefix(prefix: string): boolean {
      return (prefixCounts.get(prefix) || 0) > 0
    },

    proxyCache: proxyWeakMap,

    getArrayMeta(arrayPath: string): ArrayMeta | undefined {
      return arrayMetas.get(arrayPath)
    },

    setArrayMeta(arrayPath: string, meta: ArrayMeta): void {
      arrayMetas.set(arrayPath, meta)
    },
  }
}
