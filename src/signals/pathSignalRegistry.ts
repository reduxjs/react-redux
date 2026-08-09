import { encodePathSegment } from './arrayKeys'
import type { ArrayMeta } from './arrayKeys'
import { createSegmentIndex } from './coarseSegments'
import type { SegmentIndex } from './coarseSegments'
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

export interface RegistryStats {
  signals: number
  prefixCounts: number
  prefixOnlyPaths: number
  childIndex: number
  arrayMetas: number
  columnsByArray: number
  structuresByArray: number
  segmentSubs: number
}

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

  /** Drop all bookkeeping for a path whose signal just lost its last
   *  subscriber. Called by the signal itself, from inside the reactive
   *  system's `unlink`, when the last watching component unmounts.
   *
   *  Distinct from `prune()` in two ways that matter:
   *
   *  - No sentinel write and no signal mutation of any kind. It runs
   *    mid-`unlink`, so touching the graph would reenter it. `prune()`
   *    fires the signal because state actually changed; here the state
   *    is untouched and there is by definition nobody left to notify.
   *  - No subtree walk. Each descendant signal gets its own `unwatched`
   *    callback, so a subtree unmounting releases bottom-up on its own.
   *
   *  `node` is checked against the currently registered signal for the
   *  path. `prune()` can delete a signal and a later `getOrCreate` can
   *  install a fresh one at the same path before the old node's links
   *  are torn down; without the identity check that late callback would
   *  evict the live replacement. */
  release(pathKey: PathKey, node: ReactiveSignal<unknown>): void

  /** Number of active signals. */
  size(): number

  /** Check if a signal exists for a path (without creating one). */
  has(pathKey: PathKey): boolean

  /** Check if any tracked signal exists at or below this path prefix. */
  hasPrefix(prefix: string): boolean

  /** Return all registered signal paths (for testing/debugging). */
  debugPaths(): string[]

  /** Entry counts for every internal structure (for testing/debugging). */
  debugStats(): RegistryStats

  /** Coarse tier: inverted index of top-level state keys → deferred
   *  subscribers. Driven by SignalProvider with the changed root keys
   *  reconcileState reports each dispatch. */
  segmentIndex: SegmentIndex

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

// Unique value written into a signal as it is pruned, guaranteed to be
// `!==` its current value so the signal always fires. Setting the same
// primitive back (the old behavior) silently no-ops for strings/booleans
// under alien-signals' `!==` equality, leaving dependent computeds
// permanently stale after an entity removal.
const PRUNED = Symbol('pruned')

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

  // Remove a path from its parent's child set, dropping the parent's
  // entry entirely once it has no children left.
  function detachFromParent(pathKey: string): void {
    const idx = pathKey.lastIndexOf('.')
    if (idx === -1) return
    const parent = pathKey.substring(0, idx)
    const siblings = childIndex.get(parent)
    if (siblings === undefined) return
    siblings.delete(pathKey)
    if (siblings.size === 0) {
      childIndex.delete(parent)
    }
  }

  /**
   * After releasing a path, walk up and drop every ancestor that has
   * nothing left underneath it, stopping at the first one that is still
   * alive.
   *
   * Two kinds of ancestor need this. Prefix-only paths, registered by
   * `ensurePrefix`, never get a signal, so `unwatched` can never fire
   * for them; without this they would keep `hasPrefix` true forever and
   * the diff would keep descending into an empty subtree, which is the
   * exact cost this whole mechanism exists to remove. Link-only paths
   * are ones whose own signal was already released while descendants
   * were still alive, so `release` deliberately left them attached.
   *
   * A prefix-only path contributes 1 to its own prefix count, plus 1
   * for every signal registered at or below it. So a count of 1 or less
   * means that self-registration is all that is left and the path is
   * dead. Removing it decrements its own ancestors, which can in turn
   * make the next one up dead — walking upward handles that cascade in
   * a single pass.
   */
  function releaseDeadAncestors(pathKey: string): void {
    let idx = pathKey.lastIndexOf('.')
    while (idx !== -1) {
      const ancestor = pathKey.substring(0, idx)
      if (childIndex.has(ancestor)) {
        // Descendants still live here, so neither this path nor
        // anything above it is dead.
        return
      }
      if (prefixOnlyPaths.has(ancestor)) {
        if ((prefixCounts.get(ancestor) ?? 0) > 1) return
        prefixOnlyPaths.delete(ancestor)
        decrementPrefixes(prefixCounts, ancestor)
        detachFromParent(ancestor)
      } else if (!signals.has(ancestor)) {
        // A link-only node: its own signal was released earlier while
        // children were still alive, so `release` left it attached.
        // That last child is now gone, so it can finally be unlinked.
        detachFromParent(ancestor)
      } else {
        // A live signal — it and everything above it stay.
        return
      }
      idx = ancestor.lastIndexOf('.')
    }
  }

  const registry: PathSignalRegistry = {
    getOrCreate(pathKey: PathKey, currentValue: unknown): ReactiveSignal<unknown> {
      let sig = signals.get(pathKey)
      if (!sig) {
        const initialValue = isObjectOrArray(currentValue) ? 0 : currentValue
        // Passing the registry as owner is what makes the signal call
        // back into `release` when its last subscriber goes away.
        sig = engine.signal(initialValue, registry, pathKey)
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
          // computed won't re-run until the batch completes. The PRUNED
          // sentinel guarantees the write is `!==` the current value —
          // dependents never read the value itself, they re-run the
          // selector against real state.
          sig.set(PRUNED)
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

    release(pathKey: PathKey, node: ReactiveSignal<unknown>): void {
      // Identity guard: a fresh signal may already have replaced this
      // one at the same path (see the interface docs).
      if (signals.get(pathKey) !== node) return

      signals.delete(pathKey)
      decrementPrefixes(prefixCounts, pathKey)
      columnsByArray.delete(pathKey)
      structuresByArray.delete(pathKey)
      arrayMetas.delete(pathKey)

      // Only unlink this path structurally once nothing lives below it.
      // The child index is shared structure, not per-signal: releasing
      // "dyn.y" while "dyn.y.v" is still watched must leave the
      // parent→child chain intact, or a later prune("dyn.y") cannot
      // reach "dyn.y.v" and it leaks permanently. When children remain,
      // the path stays as a link-only node and is cleaned up by
      // `releaseDeadAncestors` once the last of them goes.
      if (!childIndex.has(pathKey)) {
        detachFromParent(pathKey)
      }

      // A column signal lives at `<arrayPath>.{*}.<prop>`, so releasing
      // it has to drop `prop` from the array's tracked column set as
      // well, or diffArray keeps shallow-comparing a column nobody
      // reads. Same shape of problem for structure signals.
      const columnMark = pathKey.lastIndexOf('.{*}.')
      if (columnMark !== -1) {
        const arrayPath = pathKey.substring(0, columnMark)
        const cols = columnsByArray.get(arrayPath)
        if (cols !== undefined) {
          // The set holds raw props while the path holds encoded ones,
          // and there is no decoder. Encoding each candidate is fine —
          // a tracked column set is a handful of entries, and encoding
          // returns the input unchanged for the common case.
          const encodedProp = pathKey.substring(columnMark + 5)
          for (const prop of cols) {
            if (encodePathSegment(prop) === encodedProp) {
              cols.delete(prop)
              break
            }
          }
          if (cols.size === 0) columnsByArray.delete(arrayPath)
        }
      } else {
        const structureMark = pathKey.lastIndexOf('.@@')
        if (structureMark !== -1) {
          const arrayPath = pathKey.substring(0, structureMark)
          const kinds = structuresByArray.get(arrayPath)
          if (kinds !== undefined) {
            kinds.delete(pathKey.substring(structureMark + 3) as StructureKind)
            if (kinds.size === 0) structuresByArray.delete(arrayPath)
          }
        }
      }

      releaseDeadAncestors(pathKey)
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

    debugStats(): RegistryStats {
      return {
        signals: signals.size,
        prefixCounts: prefixCounts.size,
        prefixOnlyPaths: prefixOnlyPaths.size,
        childIndex: childIndex.size,
        arrayMetas: arrayMetas.size,
        columnsByArray: columnsByArray.size,
        structuresByArray: structuresByArray.size,
        segmentSubs: registry.segmentIndex.size(),
      }
    },

    segmentIndex: createSegmentIndex(),

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
