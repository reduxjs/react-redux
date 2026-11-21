import { encodePathSegment, findKeyField } from './arrayKeys'
import { createSegmentIndex } from './segmentIndex'
import type { SegmentIndex } from './segmentIndex'
import { isObjectOrArray } from './objects'
import type { LeafObjectTracker } from './trackingProxy'
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
  arrays: number
  columns: number
  structures: number
  segmentSubs: number
}

export interface EvaluationState {
  /** Leaf tracker of the selector evaluation running right now, or null
   *  between evaluations. Proxies read it at trap time instead of closing
   *  over a tracker, so cached proxies record into the active evaluation,
   *  and reads through a proxy kept past its evaluation record nothing. */
  tracker: LeafObjectTracker | null

  /** Incremented each time a root tracking proxy is created, i.e. once
   *  per selector evaluation. Proxies use it to scope their last-read
   *  memo to the current evaluation. */
  epoch: number

  /**
   * Tracking proxies keyed by target identity, reused across evaluations.
   * Immer's structural sharing keeps unchanged subtrees at the same
   * reference across snapshots, so their proxies can be reused.
   *
   * KNOWN TRADEOFF: an object aliased at two paths (e.g.
   * `state.selected = state.items[0]`) reuses the proxy created for
   * whichever path was read first, so child reads through the second path
   * register signals under the first path. Per-path proxies would fix the
   * attribution but break identity comparison (`state.selected ===
   * state.items[0]` must hold, and two proxies are never `===`). The alias
   * path itself still gets a version-signal dependency via the leaf-object
   * tracker, so replacing the aliased object re-runs the selector — the
   * misattribution can cause excess re-runs, never missed ones.
   */
  proxyCache: WeakMap<object, object>

  /** Encoded path keys for top-level state properties. Root proxies are
   *  created fresh per evaluation, so they share this instead of each
   *  building its own. */
  rootPathKeyCache: Map<string, string>
}

/** Bookkeeping for one array path. Exists while any of its fields is
 *  set; flush and prune drop the whole record with the path. */
export interface ArrayRecord {
  /** Property that identifies elements, once detected. */
  keyField?: string
  /** Column signal path → raw element property it watches. */
  columns?: Map<string, string>
  /** Structure signal path → the change kind it watches. */
  structures?: Map<string, StructureKind>
}

/** Inspection helpers for tests and debugging. Attached only when
 *  `process.env.NODE_ENV !== 'production'`, so production builds drop
 *  them; source code must not call them. */
export interface RegistryDebug {
  /** Number of active signals. */
  size(): number

  /** Check if a signal exists for a path (without creating one). */
  has(pathKey: PathKey): boolean

  /** All registered signal paths, sorted. */
  debugPaths(): string[]

  /** Entry counts for every internal structure. */
  debugStats(): RegistryStats
}

export interface PathSignalRegistry extends RegistryDebug {
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

  /** Check if any tracked signal exists at or below this path prefix. */
  hasPrefix(prefix: string): boolean

  /** Coarse tier: inverted index of top-level state keys → deferred
   *  subscribers. Driven by SignalProvider with the changed root keys
   *  reconcileState reports each dispatch. */
  segmentIndex: SegmentIndex

  /** State the tracking proxies share across selector evaluations. */
  evaluation: EvaluationState

  /** Key field for the array at `arrayPath`. Detected from `sample` (an
   *  element) and stored on first success; later calls return the stored
   *  field without looking at `sample`. */
  keyFieldFor(arrayPath: string, sample: unknown): string | undefined

  /** The array's record, if it has a key field or tracked signals. */
  getArrayRecord(arrayPath: string): ArrayRecord | undefined

  /** Register a column signal for an array: a dependency on property `prop`
   *  of ANY element of the array at `arrayPath`. Fired by diff when any
   *  element's value for that property changes (or membership changes). */
  trackColumn(arrayPath: string, prop: string): ReactiveSignal<unknown>

  /** Fire the column signal at `columnPath` (a key of
   *  `ArrayRecord.columns`), if it still exists. */
  bumpColumn(columnPath: string): void

  /** Register a structural signal for an array: a dependency on a specific
   *  kind of membership/order change (append, insertOrReorder, remove).
   *  Fired selectively by diff based on how the array actually changed. */
  trackStructure(
    arrayPath: string,
    kind: StructureKind,
  ): ReactiveSignal<unknown>

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
  // is encoded like any other path segment. The diff side bumps the path
  // stored in the array record, so it never re-encodes.
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

// Object/array/column/structure signals hold version counters, not
// values. Bump forces every subscribed computed to re-evaluate. The
// non-number fallback resets a signal whose last value was a PRUNED
// sentinel or a real leaf value before the path's shape changed.
function bumpVersion(sig: ReactiveSignal<unknown>): void {
  const current = sig.get()
  sig.set(typeof current === 'number' ? current + 1 : 0)
}

// Unique value written into a signal as it is pruned, guaranteed to be
// `!==` its current value so the signal always fires. Setting the same
// primitive back would no-op under the signal's `!==` equality, leaving
// dependent computeds permanently stale after an entity removal.
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
  // Per-array key field and tracked column/structure signals. diffArray
  // reads these to pick identity or index diffing and to decide which
  // element properties to shallow-compare.
  const arrays = new Map<string, ArrayRecord>()

  // Drop a column or structure signal's entry from its array's record.
  // Column paths are `<array>.{*}.<prop>`, structure paths are
  // `<array>.@@<kind>`; any other path misses both lookups.
  function forgetArraySignal(pathKey: string): void {
    const dot = pathKey.lastIndexOf('.')
    if (dot === -1) return
    let arrayPath = pathKey.substring(0, dot)
    const isColumn = arrayPath.endsWith('.{*}')
    if (isColumn) arrayPath = arrayPath.substring(0, arrayPath.length - 4)
    const rec = arrays.get(arrayPath)
    if (rec === undefined) return
    if (isColumn) {
      if (rec.columns?.delete(pathKey) && rec.columns.size === 0) {
        rec.columns = undefined
      }
    } else if (rec.structures?.delete(pathKey) && rec.structures.size === 0) {
      rec.structures = undefined
    }
    if (!rec.keyField && !rec.columns && !rec.structures) {
      arrays.delete(arrayPath)
    }
  }

  function recordFor(arrayPath: string): ArrayRecord {
    let rec = arrays.get(arrayPath)
    if (rec === undefined) {
      rec = {}
      arrays.set(arrayPath, rec)
    }
    return rec
  }

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

  // Paths whose signal has been released but whose prefix accounting and
  // structural unlinking have not been applied yet. Draining is deferred
  // so that a subtree unmounting - which fires one `release` per node -
  // pays for each shared ancestor once instead of once per node.
  const pendingReleases = new Set<string>()

  function depthOf(path: string): number {
    let depth = 0
    for (let i = 0; i < path.length; i++) {
      if (path.charCodeAt(i) === 46 /* '.' */) depth++
    }
    return depth
  }

  /**
   * Apply the prefix decrements and child-index unlinking owed by every
   * released path in one deepest-first pass, so a subtree unmounting
   * visits each shared ancestor once instead of once per release. Each
   * path's owed count is the sum from its released descendants and is
   * passed up to its parent after it is applied.
   *
   * Childless paths are removed along the way: prefix-only paths (from
   * `ensurePrefix`, which never get a signal and so never get released)
   * once only their own registration is left, and paths whose signal is
   * gone. Never touches a signal, so it is safe to run mid-`unlink`.
   */
  function flushReleases(): void {
    // How many prefix-count decrements each touched path still owes.
    const owed = new Map<string, number>()
    // Touched paths bucketed by depth, so the pass can go deepest-first
    // without sorting.
    const byDepth: (string[] | undefined)[] = []

    function addOwed(path: string, count: number): void {
      const prev = owed.get(path)
      if (prev !== undefined) {
        owed.set(path, prev + count)
        return
      }
      owed.set(path, count)
      const depth = depthOf(path)
      const bucket = byDepth[depth]
      if (bucket === undefined) byDepth[depth] = [path]
      else bucket.push(path)
    }

    for (const path of pendingReleases) addOwed(path, 1)
    // Cleared up front: the pass only reads `signals`, and a released
    // path was removed from it synchronously.
    pendingReleases.clear()

    for (let depth = byDepth.length - 1; depth >= 0; depth--) {
      const bucket = byDepth[depth]
      if (bucket === undefined) continue
      // Parents are strictly shallower, so entries appended below always
      // land in a bucket this loop has not reached yet.
      for (const path of bucket) {
        let count = owed.get(path)!

        const current = prefixCounts.get(path)
        if (current !== undefined) {
          if (current <= count) prefixCounts.delete(path)
          else prefixCounts.set(path, current - count)
        }

        if (!childIndex.has(path)) {
          if (prefixOnlyPaths.has(path)) {
            if ((prefixCounts.get(path) ?? 0) <= 1) {
              prefixOnlyPaths.delete(path)
              prefixCounts.delete(path)
              detachFromParent(path)
              arrays.delete(path)
              count += 1
            }
          } else if (!signals.has(path)) {
            // Either a path just released, or a link-only node whose
            // last child has now gone. A path resurrected by
            // `getOrCreate` before this flush ran is live again and
            // correctly falls through untouched. Nothing is tracked at
            // or below it any more, so its array record goes too.
            detachFromParent(path)
            arrays.delete(path)
          }
        }

        const dot = path.lastIndexOf('.')
        if (dot !== -1) addOwed(path.substring(0, dot), count)
      }
    }
  }

  const registry: Omit<PathSignalRegistry, keyof RegistryDebug> = {
    getOrCreate(
      pathKey: PathKey,
      currentValue: unknown,
    ): ReactiveSignal<unknown> {
      let sig = signals.get(pathKey)
      if (!sig) {
        if (pendingReleases.size !== 0) flushReleases()
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
      // Flush only removes entries from these structures, so the checks
      // above cannot flip from false to true across it.
      if (pendingReleases.size !== 0) flushReleases()
      prefixOnlyPaths.add(pathKey)
      addToChildIndex(pathKey)
      incrementPrefixes(prefixCounts, pathKey)
    },

    update(pathKey: PathKey, newValue: unknown): void {
      const sig = signals.get(pathKey)
      if (!sig) return

      if (isObjectOrArray(newValue)) {
        bumpVersion(sig)
      } else {
        sig.set(newValue)
      }
    },

    prune(pathKey: PathKey): void {
      if (pendingReleases.size !== 0) flushReleases()
      // Recursively remove this path and all descendants using the child index.
      // O(subtree size) instead of O(total signals).
      const stack: string[] = [pathKey]
      while (stack.length > 0) {
        const key = stack.pop()!
        arrays.delete(key)
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
          if (arrays.size !== 0) forgetArraySignal(key)
          decrementPrefixes(prefixCounts, key)
        } else if (prefixOnlyPaths.has(key)) {
          prefixOnlyPaths.delete(key)
          decrementPrefixes(prefixCounts, key)
        }
      }
      detachFromParent(pathKey)
    },

    release(pathKey: PathKey, node: ReactiveSignal<unknown>): void {
      // Identity guard: a fresh signal may already have replaced this
      // one at the same path (see the interface docs).
      if (signals.get(pathKey) !== node) return

      signals.delete(pathKey)

      // Otherwise diffArray keeps shallow-comparing a column, or
      // classifying changes for a structure kind, that nobody reads.
      if (arrays.size !== 0) forgetArraySignal(pathKey)

      // Prefix accounting and structural unlinking are deferred to the
      // next `flushReleases`, which merges this path's ancestor walk
      // with every other release queued alongside it. Until then
      // `prefixCounts` reads high, so `hasPrefix` can say yes for a
      // subtree that is already dead - a missed optimization for the
      // rest of the current teardown, never a wrong answer, and every
      // reader of that state flushes first.
      pendingReleases.add(pathKey)
    },

    pruneChildren(pathKey: PathKey): void {
      if (pendingReleases.size !== 0) flushReleases()
      const children = childIndex.get(pathKey)
      if (!children) return
      // prune() mutates the parent's child set — iterate over a copy
      for (const child of Array.from(children)) {
        registry.prune(child)
      }
    },

    hasPrefix(prefix: string): boolean {
      if (pendingReleases.size !== 0) flushReleases()
      return (prefixCounts.get(prefix) || 0) > 0
    },

    segmentIndex: createSegmentIndex(),

    evaluation: {
      tracker: null,
      epoch: 0,
      proxyCache: new WeakMap(),
      rootPathKeyCache: new Map(),
    },

    keyFieldFor(arrayPath: string, sample: unknown): string | undefined {
      const rec = arrays.get(arrayPath)
      if (rec?.keyField !== undefined) return rec.keyField
      const keyField = findKeyField(sample)
      if (keyField !== undefined) {
        if (rec !== undefined) rec.keyField = keyField
        else arrays.set(arrayPath, { keyField })
      }
      return keyField
    },

    getArrayRecord(arrayPath: string): ArrayRecord | undefined {
      return arrays.get(arrayPath)
    },

    trackColumn(arrayPath: string, prop: string): ReactiveSignal<unknown> {
      // Register the intermediate `{*}` segment so prune(arrayPath)
      // reaches column signals through the child index.
      registry.ensurePrefix(arrayPath + '.{*}')
      const columnPath = buildColumnPath(arrayPath, prop)
      const sig = registry.getOrCreate(columnPath, 0)
      // After getOrCreate: its flush of pending releases can delete the
      // record, and a record created before that would be lost.
      const rec = recordFor(arrayPath)
      ;(rec.columns ??= new Map()).set(columnPath, prop)
      return sig
    },

    bumpColumn(columnPath: string): void {
      const sig = signals.get(columnPath)
      if (sig) bumpVersion(sig)
    },

    trackStructure(
      arrayPath: string,
      kind: StructureKind,
    ): ReactiveSignal<unknown> {
      const structurePath = buildStructurePath(arrayPath, kind)
      const sig = registry.getOrCreate(structurePath, 0)
      const rec = recordFor(arrayPath)
      ;(rec.structures ??= new Map()).set(structurePath, kind)
      return sig
    },

    bumpStructure(arrayPath: string, kind: StructureKind): void {
      const sig = signals.get(buildStructurePath(arrayPath, kind))
      if (sig) bumpVersion(sig)
    },
  }

  if (process.env.NODE_ENV !== 'production') {
    const debug: RegistryDebug = {
      size: () => signals.size,
      has: (pathKey) => signals.has(pathKey),
      debugPaths: () => Array.from(signals.keys()).sort(),
      debugStats() {
        if (pendingReleases.size !== 0) flushReleases()
        let columns = 0
        let structures = 0
        for (const rec of arrays.values()) {
          columns += rec.columns?.size ?? 0
          structures += rec.structures?.size ?? 0
        }
        return {
          signals: signals.size,
          prefixCounts: prefixCounts.size,
          prefixOnlyPaths: prefixOnlyPaths.size,
          childIndex: childIndex.size,
          arrays: arrays.size,
          columns,
          structures,
          segmentSubs: registry.segmentIndex.size(),
        }
      },
    }
    Object.assign(registry, debug)
  }

  // The debug helpers are absent in production; see RegistryDebug.
  return registry as PathSignalRegistry
}
