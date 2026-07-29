import { encodePathSegment } from './arrayKeys'
import type { ArrayMeta } from './arrayKeys'
import type { LeafObjectTracker, ProxyCache } from './trackingProxy'
import type { PathKey, ReactiveSignal, SignalEngine } from './types'

/**
 * Kinds of structural array changes that scans can depend on selectively.
 * - `append`: elements added after all surviving elements
 * - `insertOrReorder`: elements inserted before surviving elements, or
 *   surviving elements changed relative order
 * - `remove`: elements removed (relative order of survivors preserved)
 */
export type StructureKind = 'append' | 'insertOrReorder' | 'remove'

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

  /** Remove signals for all child paths, keeping the path's own signal.
   *  Used when a subtree is replaced by a value the diff can't recurse
   *  into (e.g., a class instance) — child reads fire once instead of
   *  going silently stale. */
  pruneChildren(pathKey: PathKey): void

  /** Number of active signals. */
  size(): number

  /** Check if a signal exists for a path (without creating one). */
  has(pathKey: PathKey): boolean

  /** Check if any tracked signal exists at or below this path prefix. */
  hasPrefix(prefix: string): boolean

  /** Return all registered signal paths (for testing/debugging). */
  debugPaths(): string[]

  /** Proxy cache for reusing proxies across evaluations (keyed by object identity). */
  proxyCache: ProxyCache

  /** Holder for the leaf tracker of the evaluation currently running.
   *  Proxies read this at trap time instead of closing over a tracker,
   *  so cached proxies record into whichever evaluation is active. */
  leafTrackerHolder: { current: LeafObjectTracker | undefined }

  /** Get array metadata for identity-based tracking at a given path. */
  getArrayMeta(arrayPath: string): ArrayMeta | undefined

  /** Set/update array metadata for identity-based tracking. */
  setArrayMeta(arrayPath: string, meta: ArrayMeta): void

  /** Register a column signal for an array: a dependency on property `prop`
   *  of ANY element of the array at `arrayPath`. Fired by diff when any
   *  element's value for that property changes (or membership changes). */
  trackColumn(arrayPath: string, prop: string): ReactiveSignal<unknown>

  /** Get the set of tracked column properties for an array path. */
  getTrackedColumns(arrayPath: string): Set<string> | undefined

  /** Fire the column signal for (arrayPath, prop), if one exists. */
  bumpColumn(arrayPath: string, prop: string): void

  /** Register a structural signal for an array: a dependency on a specific
   *  kind of membership/order change (append, insertOrReorder, remove).
   *  Fired selectively by diff based on how the array actually changed. */
  trackStructure(arrayPath: string, kind: StructureKind): ReactiveSignal<unknown>

  /** Get the set of tracked structure kinds for an array path. */
  getTrackedStructures(arrayPath: string): Set<StructureKind> | undefined

  /** Fire the structural signal for (arrayPath, kind), if one exists. */
  bumpStructure(arrayPath: string, kind: StructureKind): void
}

/**
 * Build the path key for a column signal.
 * Uses `{*}` as the element segment — it can never collide with real
 * object keys or identity paths (`{keyField:value}`).
 * @param arrayPath - Path to the array in the state tree
 * @param prop - Element property name being tracked
 * @returns The column signal path key
 */
function buildColumnPath(arrayPath: string, prop: string): string {
  // prop comes from user state (a scanned element property name), so it
  // is encoded like any other path segment. Both trackColumn (proxy
  // side) and bumpColumn (diff side) route through here, so the two
  // sides always agree.
  return arrayPath + '.{*}.' + encodePathSegment(prop)
}

/**
 * Build the path key for a structural signal.
 * Uses `@@` segments (like `@@keys`) that can't collide with real keys.
 * @param arrayPath - Path to the array in the state tree
 * @param kind - The structural change kind
 * @returns The structural signal path key
 */
function buildStructurePath(arrayPath: string, kind: StructureKind): string {
  return arrayPath + '.@@' + kind
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
  // Tracked column properties per array path.
  // Lets diffArray know which element properties to shallow-compare.
  const columnsByArray = new Map<string, Set<string>>()
  // Tracked structural change kinds per array path.
  // Lets diffArray know whether structural classification is needed.
  const structuresByArray = new Map<string, Set<StructureKind>>()

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

  const registry: PathSignalRegistry = {
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
        // Drop column/structure/identity tracking for any array at or below the pruned path
        columnsByArray.delete(key)
        structuresByArray.delete(key)
        arrayMetas.delete(key)
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
          const sig = signals.get(key)!
          // Fire the signal before removing it. This ensures any computed
          // that depended on this path re-evaluates with the new state.
          // Prune runs inside engine.batch() via reconcileState, so the
          // computed won't re-run until the batch completes.
          const current = sig.get()
          sig.set(typeof current === 'number' ? current + 1 : current)
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

    pruneChildren(pathKey: PathKey): void {
      const children = childIndex.get(pathKey)
      if (!children) return
      // prune() mutates the parent's child set — iterate over a copy
      for (const child of Array.from(children)) {
        registry.prune(child)
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

    debugPaths(): string[] {
      return Array.from(signals.keys()).sort()
    },

    proxyCache: proxyWeakMap,

    leafTrackerHolder: { current: undefined },

    getArrayMeta(arrayPath: string): ArrayMeta | undefined {
      return arrayMetas.get(arrayPath)
    },

    setArrayMeta(arrayPath: string, meta: ArrayMeta): void {
      arrayMetas.set(arrayPath, meta)
    },

    trackColumn(arrayPath: string, prop: string): ReactiveSignal<unknown> {
      let cols = columnsByArray.get(arrayPath)
      if (!cols) {
        cols = new Set()
        columnsByArray.set(arrayPath, cols)
      }
      cols.add(prop)
      // Register the intermediate `{*}` segment so prune(arrayPath)
      // reaches column signals through the child index.
      registry.ensurePrefix(arrayPath + '.{*}')
      return registry.getOrCreate(buildColumnPath(arrayPath, prop), 0)
    },

    getTrackedColumns(arrayPath: string): Set<string> | undefined {
      return columnsByArray.get(arrayPath)
    },

    bumpColumn(arrayPath: string, prop: string): void {
      const sig = signals.get(buildColumnPath(arrayPath, prop))
      if (!sig) return
      const current = sig.get()
      sig.set(typeof current === 'number' ? current + 1 : 0)
    },

    trackStructure(
      arrayPath: string,
      kind: StructureKind,
    ): ReactiveSignal<unknown> {
      let kinds = structuresByArray.get(arrayPath)
      if (!kinds) {
        kinds = new Set()
        structuresByArray.set(arrayPath, kinds)
      }
      kinds.add(kind)
      return registry.getOrCreate(buildStructurePath(arrayPath, kind), 0)
    },

    getTrackedStructures(arrayPath: string): Set<StructureKind> | undefined {
      return structuresByArray.get(arrayPath)
    },

    bumpStructure(arrayPath: string, kind: StructureKind): void {
      const sig = signals.get(buildStructurePath(arrayPath, kind))
      if (!sig) return
      const current = sig.get()
      sig.set(typeof current === 'number' ? current + 1 : 0)
    },
  }

  return registry
}
