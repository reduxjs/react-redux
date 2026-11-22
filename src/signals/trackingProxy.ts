import {
  encodePathSegment,
  getElementPathKey,
  joinPath,
  KEYS_SEED,
  keysMetaPath,
} from './arrayKeys'
import {
  isOverriddenArrayMethod,
  createArrayMethodInterceptor,
} from './arrayMethodOverrides'
import { throwStateMutationError } from './mutationError'
import type { PathSignalRegistry } from './pathSignalRegistry'
import { isObjectOrArray, isPlainObject } from './objects'
import { registerTrackingProxy, shellDescriptor } from './proxyIdentity'

// Fast check for array-index-like property names ('0', '42', ...).
// Canonical array index strings always start with a digit; named array
// props ('length', 'includes', ...) never do. Cheaper than Number()+isNaN
// on the hottest trap path (element scans).
function isIndexProp(prop: string): boolean {
  const c = prop.charCodeAt(0)
  return c >= 48 && c <= 57
}

// Dev-mode check: how many consecutive memoized re-reads of one primitive
// path within a single evaluation trigger the "hoist this read" warning.
const REPEATED_READ_WARN_THRESHOLD = 100

const repeatedReadWarnings = new WeakMap<PathSignalRegistry, Set<string>>()

function warnRepeatedRead(registry: PathSignalRegistry, pathKey: string) {
  let warned = repeatedReadWarnings.get(registry)
  if (!warned) {
    warned = new Set()
    repeatedReadWarnings.set(registry, warned)
  }
  if (warned.has(pathKey)) return
  warned.add(pathKey)
  console.warn(
    `[react-redux] useSignalSelector: a selector read '${pathKey}' ` +
      `${REPEATED_READ_WARN_THRESHOLD}+ times in a single evaluation. ` +
      'Reads through the tracked state proxy cost more than plain property ' +
      'reads — hoist the value into a local before looping.',
  )
}

/**
 * Tracks which object-typed proxy accesses are "leaf" accesses —
 * objects that were read by the selector but never had their properties
 * accessed (i.e., used only for identity comparison like `===`).
 *
 * After the selector runs, leaf objects need their version signals
 * explicitly read so that identity changes (ref swaps) are tracked.
 */
export interface LeafObjectTracker {
  /** All paths where an object/array value was read, mapped to their raw values */
  accessedObjects: Map<string, object>
  /** Paths that had children accessed (i.e., were traversed, not leaves) */
  traversedPaths: Set<string>
  /** Plain objects whose keys were enumerated this evaluation, with the
   *  dependency reads deferred until `finalizeDependencies` decides
   *  whether they collapse onto the object's own version signal. */
  enumerated: Map<string, EnumerationRecord>
}

/**
 * Deferred reads for one enumerated object. A spread (`{...obj}`),
 * `Object.keys(obj).map(k => obj[k])`, `Object.values`, `Object.entries`,
 * `shallowEqual`, and `JSON.stringify` all call `ownKeys` and then read
 * every own key. Reading every own value of an immutably updated object
 * depends on exactly the same thing as the object's identity, so once the
 * evaluation ends and the reads are known to be complete, one version
 * signal on the object replaces a signal per key plus the keys-meta
 * signal. An incomplete enumeration (`Object.keys(obj).length`, or
 * enumerating and reading a subset) replays the deferred reads instead.
 */
export interface EnumerationRecord {
  target: object
  keysRead: Set<string>
  leaves: Array<[pathKey: string, value: unknown]>
  objects: Array<[pathKey: string, value: object]>
}

/**
 * Create an empty tracker for one selector evaluation.
 * @returns A fresh LeafObjectTracker
 */
export function createLeafTracker(): LeafObjectTracker {
  return {
    accessedObjects: new Map(),
    traversedPaths: new Set(),
    enumerated: new Map(),
  }
}

/**
 * Register the dependencies an evaluation deferred: collapse or replay
 * each enumerated object, then read version signals for leaf objects
 * (read but never traversed — identity-only usage). Must run inside the
 * same reactive computation that ran the selector, after it returned.
 * @param tracker - The tracker installed for the evaluation
 * @param registry - Signal registry for dependency tracking
 * @returns void
 */
export function finalizeDependencies(
  tracker: LeafObjectTracker,
  registry: PathSignalRegistry,
): void {
  // Pass 1: decide which enumerations are complete. A collapsed object's
  // version signal fires on any change beneath it, so every deferred read
  // under a collapsed ancestor is redundant and gets skipped in pass 2
  // (JSON.stringify collapses each nested object; only the outermost
  // needs a signal). Records are checked against ancestors, not order,
  // because a child can be enumerated before its parent.
  const collapsed = new Set<string>()
  for (const [objPath, record] of tracker.enumerated) {
    tracker.traversedPaths.add(objPath)
    if (isCompleteEnumeration(record)) {
      collapsed.add(objPath)
    }
  }
  const underCollapsed = (path: string): boolean => {
    for (const c of collapsed) {
      if (
        path.length > c.length &&
        path.startsWith(c) &&
        path[c.length] === '.'
      ) {
        return true
      }
    }
    return false
  }

  // Pass 2: read one version signal per collapsed object; replay the
  // deferred reads for incomplete enumerations.
  for (const [objPath, record] of tracker.enumerated) {
    if (underCollapsed(objPath)) continue
    if (collapsed.has(objPath)) {
      registry.getOrCreate(objPath, record.target).get()
      continue
    }
    registry.getOrCreate(keysMetaPath(objPath), KEYS_SEED).get()
    for (let i = 0; i < record.leaves.length; i++) {
      const [pathKey, value] = record.leaves[i]
      registry.getOrCreate(pathKey, value).get()
    }
    for (let i = 0; i < record.objects.length; i++) {
      const [pathKey, value] = record.objects[i]
      registry.ensurePrefix(pathKey)
      tracker.accessedObjects.set(pathKey, value)
    }
  }

  // Skip the root: its version signal is never fired by diff.
  for (const [objPath, rawValue] of tracker.accessedObjects) {
    if (
      objPath !== '' &&
      !tracker.traversedPaths.has(objPath) &&
      !underCollapsed(objPath)
    ) {
      registry.getOrCreate(objPath, rawValue).get()
    }
  }
}

function isCompleteEnumeration(record: EnumerationRecord): boolean {
  const ownKeys = Object.keys(record.target)
  for (let i = 0; i < ownKeys.length; i++) {
    if (!record.keysRead.has(ownKeys[i])) return false
  }
  return true
}

/**
 * Creates a read-only tracking proxy that wraps frozen Redux state.
 *
 * On property access, the proxy:
 * 1. Reads the corresponding path signal (establishing a reactive dependency)
 * 2. Returns the actual frozen value (primitives) or a nested tracking proxy (objects/arrays)
 *
 * For frozen state compatibility: the proxy target is a thin unfrozen shell
 * that mirrors the real state's structure. This avoids the ES Proxy invariant
 * that forbids returning different values for non-configurable properties.
 * The proxy reads actual values from the real frozen state object.
 * Because the shell is extensible, `Object.isFrozen(proxy)` returns false
 * even when the state is frozen; `unwrap` it to check the state itself.
 *
 * Child proxies are cached in `registry.evaluation.proxyCache`, keyed by
 * target identity. The cache persists across evaluations and dispatches,
 * so an unchanged subtree yields the same proxy object every time —
 * selector results built from those proxies stay referentially equal. The
 * root proxy is the exception: it is created fresh on every call so that
 * caches keyed on the state argument cannot skip the selector body.
 *
 * Leaf-object and enumeration bookkeeping goes to
 * `registry.evaluation.tracker`, which the caller sets for the duration
 * of one evaluation.
 * @param target - The frozen state object to wrap
 * @param parentPath - Dot-separated path to this object in the state tree
 * @param registry - Signal registry for dependency tracking
 * @returns A tracking proxy wrapping the target
 */
export function createTrackingProxy<T extends object>(
  target: T,
  parentPath: string,
  registry: PathSignalRegistry,
): T {
  const evaluation = registry.evaluation
  const cache = evaluation.proxyCache

  // The root proxy is never cached: every evaluation gets a fresh one.
  // Memoized selectors (Reselect's argsMemoize, WeakMap caches keyed on
  // the state argument) short-circuit when handed an argument they have
  // seen before, and a short-circuited call reads no state properties, so
  // the evaluation would record no dependencies. A fresh root defeats
  // that cache every time. Result functions stay memoized because their
  // inputs are child proxies, which ARE cached by target identity.
  const isRoot = parentPath === ''
  if (isRoot) {
    evaluation.epoch++
  } else {
    const cached = cache.get(target)
    if (cached) return cached as T
  }

  // Last-read memo for primitive leaves. Within one evaluation a repeated
  // read of the same prop is idempotent: state is immutable so the value
  // cannot change, the signal dependency is already linked, and the leaf
  // tracker already marked this object as traversed. Selectors that loop
  // over a collection while comparing against one proxied field
  // (`items.filter(i => i.ownerId === user.id)`) hit this path once per
  // element, so skipping the path-key/registry/signal lookups matters.
  // The memo is scoped by the evaluation epoch: cached proxies outlive the
  // evaluation that created them, and a stale hit on a later evaluation
  // would silently drop the dependency.
  let lastEpoch = -1
  let lastProp: string | undefined
  let lastValue: unknown
  let repeatCount = 0

  // The enumeration record for this object is created by this proxy's own
  // ownKeys trap, so the get trap can find it with an epoch compare instead
  // of a Map lookup per read. Element scans over non-enumerated objects are
  // the hot path and must not pay for the lookup.
  let enumEpoch = -1
  let enumRecord: EnumerationRecord | undefined
  const currentEnumeration = () =>
    enumEpoch === evaluation.epoch ? enumRecord : undefined

  // Index reads of keyed elements subscribe to this array's position
  // signals once per evaluation.
  let positionEpoch = -1

  // Use an unfrozen shell as the proxy target to avoid ES Proxy invariant
  // violations with frozen objects. The shell copies the target's prototype
  // so that Array.isArray, instanceof, etc. work correctly.
  const shell = Array.isArray(target)
    ? []
    : Object.create(Object.getPrototypeOf(target))

  // Per-proxy cache of prop -> full path string. parentPath is fixed for
  // this proxy's lifetime, so path keys are stable. Reusing the same
  // string instance avoids re-allocating on every read AND lets V8 cache
  // the string hash, speeding up the registry Map lookups downstream.
  // Property keys are encoded so reserved path characters in state keys
  // (dots in RTKQ cache keys, literal '@@keys', etc.) can't collide with
  // other paths or meta segments. The cache amortizes the encoding.
  // Root proxies are not reused, so they share the registry's cache.
  const pathKeyCache = isRoot
    ? evaluation.rootPathKeyCache
    : new Map<string, string>()
  function getPathKey(prop: string): string {
    let key = pathKeyCache.get(prop)
    if (key === undefined) {
      key = joinPath(parentPath, encodePathSegment(prop))
      pathKeyCache.set(prop, key)
    }
    return key
  }

  const proxy = new Proxy(shell, {
    get(_obj, prop, _receiver) {
      // Symbols: read from actual target (iterator protocol, toStringTag, etc.)
      if (typeof prop === 'symbol') return Reflect.get(target, prop)

      if (prop === lastProp && evaluation.epoch === lastEpoch) {
        // A repeat read still counts toward a complete enumeration (a
        // field read directly and then again via a spread). The first
        // read already registered whatever dependency it needed.
        currentEnumeration()?.keysRead.add(prop)
        if (process.env.NODE_ENV !== 'production') {
          if (++repeatCount === REPEATED_READ_WARN_THRESHOLD) {
            warnRepeatedRead(registry, getPathKey(prop))
          }
        }
        return lastValue
      }

      const value = (target as Record<string, unknown>)[prop]
      const leafTracker = evaluation.tracker

      // Functions: intercept array methods to avoid per-element proxy creation
      if (typeof value === 'function') {
        if (Array.isArray(target) && isOverriddenArrayMethod(prop as string)) {
          // Mark the array as traversed: the interceptor registers its own
          // precise dependencies (column/structural signals or coarse
          // fallback), so the leaf tracker must NOT also subscribe to the
          // array's version signal (which fires on every array change).
          if (leafTracker) {
            leafTracker.traversedPaths.add(parentPath)
          }
          return createArrayMethodInterceptor(
            target,
            prop as string,
            registry,
            parentPath,
          )
        }
        return value
      }

      // Primitive array elements: subscribe to the array's version signal
      // instead of creating one signal per index. Primitive arrays (number
      // history buffers, id lists, etc.) can be huge — per-index signals
      // cost O(N) creation at mount for little precision benefit. The
      // array version fires on any array change (diffArray always bumps
      // it), so this over-fires only when a selector reads a subset of a
      // primitive array — consistent with erring toward firing.
      // Checked BEFORE building pathKey: element scans are the hottest
      // path through this trap, and the coarse signal only needs the
      // (stable, hash-memoized) parentPath string — no per-read allocs.
      // Root arrays (parentPath === '') keep per-index signals since the
      // root version signal is never fired by diff.
      if (
        Array.isArray(target) &&
        parentPath !== '' &&
        isIndexProp(prop as string) &&
        !isObjectOrArray(value)
      ) {
        if (leafTracker) {
          leafTracker.traversedPaths.add(parentPath)
        }
        registry.getOrCreate(parentPath, target).get()
        return value
      }

      let pathKey = getPathKey(prop as string)

      if (isObjectOrArray(value)) {
        // Array elements use the identity path (items.{id:42}) when the
        // array has a key field, so signals survive reorders.
        if (Array.isArray(target) && isIndexProp(prop as string)) {
          const elementPath = getElementPathKey(
            registry,
            parentPath,
            prop,
            value,
          )
          // The identity path follows the element, not the index. A read
          // of `items[0]` must also re-run when a different element lands
          // at index 0, which only happens on a reorder, a middle insert,
          // or a removal. Append and in-place updates keep every index
          // pointing at the same key.
          if (elementPath !== pathKey && positionEpoch !== evaluation.epoch) {
            positionEpoch = evaluation.epoch
            registry.trackStructure(parentPath, 'insertOrReorder').get()
            registry.trackStructure(parentPath, 'remove').get()
          }
          pathKey = elementPath
        }

        // Non-plain objects (Date, Map, Set, class instances): return the
        // raw object, tracked by reference only. Wrapping them in a proxy
        // shell breaks prototype methods that need internal slots
        // ("this is not a Date object"), and the diff can't recurse into
        // them anyway. Reading the version signal here means a ref swap
        // at this path re-runs the selector.
        if (!Array.isArray(value) && !isPlainObject(value)) {
          if (leafTracker) {
            leafTracker.traversedPaths.add(parentPath)
            // Counts toward a complete enumeration; the reference read
            // stays immediate and is simply redundant if it collapses.
            currentEnumeration()?.keysRead.add(prop as string)
          }
          registry.getOrCreate(pathKey, value).get()
          return value
        }

        // Return cached child proxy (createTrackingProxy checks cache internally).
        const childProxy = createTrackingProxy(
          value as object,
          pathKey,
          registry,
        )

        // Enumeration in progress on this object: defer the prefix and
        // leaf-object bookkeeping to finalizeDependencies.
        const enumeration = currentEnumeration()
        if (enumeration !== undefined) {
          if (!enumeration.keysRead.has(prop as string)) {
            enumeration.keysRead.add(prop as string)
            enumeration.objects.push([pathKey, value as object])
          }
          return childProxy
        }

        // Register in prefix index (for hasPrefix/diff tracking) but DON'T
        // create a signal. This avoids allocating signals for intermediate
        // objects that are only traversed, not read as terminal values.
        registry.ensurePrefix(pathKey)

        if (leafTracker) {
          // Mark parent as traversed (it has children being accessed)
          leafTracker.traversedPaths.add(parentPath)
          // Track this object access — may be a leaf (identity-only usage)
          leafTracker.accessedObjects.set(pathKey, value as object)
        }

        return childProxy
      }

      if (leafTracker) {
        // Enumeration in progress on this object: defer the leaf read to
        // finalizeDependencies.
        const enumeration = currentEnumeration()
        if (enumeration !== undefined) {
          if (!enumeration.keysRead.has(prop as string)) {
            enumeration.keysRead.add(prop as string)
            enumeration.leaves.push([pathKey, value])
          }
          lastEpoch = evaluation.epoch
          lastProp = prop as string
          lastValue = value
          repeatCount = 0
          return value
        }
        // Mark parent as traversed (it has children being accessed)
        leafTracker.traversedPaths.add(parentPath)
      }

      // Primitive leaf: read signal to establish dependency.
      // Note: we intentionally do NOT subscribe to the parent object's
      // version signal here. Doing so causes sibling fan-out (any sibling
      // change fires the parent version under Immer structural sharing)
      // and zombie-subscription cascades after prune. Parent deletion is
      // covered by prune firing this leaf signal, and key reappearance is
      // covered by diff's added-key handling firing the leaf path.
      registry.getOrCreate(pathKey, value).get()

      lastEpoch = evaluation.epoch
      lastProp = prop as string
      lastValue = value
      repeatCount = 0

      return value
    },

    // Track when selectors iterate keys (Object.keys, for...in, spread, etc.)
    ownKeys(_obj) {
      const leafTracker = evaluation.tracker
      // Plain non-root objects defer: if every own key gets read before
      // the evaluation ends, one version signal on the object covers the
      // keys and all the values. Arrays already collapse primitive element
      // reads onto the array's version signal, and the root's version
      // signal is never fired by diff, so both keep the immediate read.
      if (leafTracker && !isRoot && !Array.isArray(target)) {
        let record = leafTracker.enumerated.get(parentPath)
        if (record === undefined) {
          record = { target, keysRead: new Set(), leaves: [], objects: [] }
          leafTracker.enumerated.set(parentPath, record)
        }
        enumRecord = record
        enumEpoch = evaluation.epoch
      } else {
        registry.getOrCreate(keysMetaPath(parentPath), KEYS_SEED).get()
      }
      return Reflect.ownKeys(target)
    },

    // Track has() checks for conditional property access (e.g., 'key' in obj)
    has(_obj, prop) {
      if (typeof prop === 'symbol') return Reflect.has(target, prop)
      // An index check on an array depends on the array's length. Keyed
      // arrays track elements at identity paths, so the diff never fires
      // their index paths.
      if (Array.isArray(target) && isIndexProp(prop)) {
        registry
          .getOrCreate(joinPath(parentPath, 'length'), target.length)
          .get()
        return Reflect.has(target, prop)
      }
      const pathKey = getPathKey(prop as string)
      registry
        .getOrCreate(pathKey, (target as Record<string, unknown>)[prop])
        .get()
      return Reflect.has(target, prop)
    },

    getOwnPropertyDescriptor(_obj, prop) {
      return shellDescriptor(target, prop)
    },

    // Report the real target's prototype
    getPrototypeOf(_obj) {
      return Object.getPrototypeOf(target)
    },

    // Prevent mutation
    set(_obj, prop) {
      throwStateMutationError('set', String(prop))
    },
    deleteProperty(_obj, prop) {
      throwStateMutationError('delete', String(prop))
    },
    defineProperty(_obj, prop) {
      throwStateMutationError('defineProperty', String(prop))
    },
    setPrototypeOf() {
      throwStateMutationError('setPrototypeOf', '')
    },
  }) as T

  // Cache by target identity — unchanged Immer subtrees reuse same proxy
  if (!isRoot) {
    cache.set(target, proxy)
  }
  registerTrackingProxy(proxy as object, target, parentPath)

  return proxy
}
