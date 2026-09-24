import {
  buildIdentityPath,
  encodePathSegment,
  findKeyField,
  getKeyValue,
  joinPath,
  keysMetaPath,
} from './arrayKeys'
import {
  isOverriddenArrayMethod,
  createArrayMethodInterceptor,
} from './arrayMethodOverrides'
import { throwStateMutationError } from './mutationError'
import type { PathSignalRegistry } from './pathSignalRegistry'

function isObjectOrArray(v: unknown): v is object {
  return v !== null && typeof v === 'object'
}

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

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
 * Maps proxy objects to their path keys.
 * Used by useSignalSelector to detect when a selector returns a proxy (object)
 * and explicitly establish a dependency on that object's signal.
 */
const proxyPathMap = new WeakMap<object, string>()

/**
 * Maps tracking proxies back to their raw target objects.
 * Used to unwrap proxy arguments in array methods like includes/indexOf
 * where identity comparison needs to work against raw array elements.
 */
const proxyTargetMap = new WeakMap<object, object>()

/**
 * Maps scan-recorder proxies (used by array method callbacks) to their
 * mutable holders. A recorder proxy is reused across all elements of a
 * scan, reading from `holder.current`. unwrap() consults this map so
 * identity comparisons inside callbacks can be unwrapped correctly.
 */
const recordingHolders = new WeakMap<object, { current: unknown }>()

/**
 * Register a scan-recorder proxy so unwrap() can resolve it to the
 * element currently being scanned.
 * @param proxy - The recorder proxy passed to array method callbacks
 * @param holder - Mutable holder whose `current` is the raw element
 * @returns void
 */
export function registerRecordingHolder(
  proxy: object,
  holder: { current: unknown },
): void {
  recordingHolders.set(proxy, holder)
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
}

/**
 * Type for the proxy cache. Exported so the registry can own one.
 * Caches proxies by their target object identity.
 * Since Immer uses structural sharing, unchanged subtrees keep the same
 * object reference across state snapshots — so we can reuse their proxies.
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
export type ProxyCache = WeakMap<object, object>

/**
 * Get the path key associated with a tracking proxy, or undefined if not a proxy.
 * @param value - The value to check
 * @returns The path string, or undefined if not a tracking proxy
 */
export function getProxyPath(value: unknown): string | undefined {
  if (value !== null && typeof value === 'object') {
    return proxyPathMap.get(value)
  }
  return undefined
}

/**
 * Get the raw target of a tracking proxy, or undefined if the value is
 * not a tracking proxy. Unlike unwrap(), this distinguishes "was a
 * proxy" from "was already raw", which the result-untracking walk needs
 * (proxies mark subtree boundaries: everything below a target is raw).
 * @param value - The value to check
 * @returns The raw target, or undefined if not a tracking proxy
 */
export function getProxyTarget(value: object): object | undefined {
  return proxyTargetMap.get(value)
}

/**
 * Register a proxy→target mapping for a proxy created outside this
 * module (the coarse-tier probe proxy). Makes `unwrap` and
 * `untrackResult` treat it like any tracking proxy.
 * @param proxy - The proxy object
 * @param target - The raw object it wraps
 * @returns void
 */
export function registerProxyTarget(proxy: object, target: object): void {
  proxyTargetMap.set(proxy, target)
}

/**
 * Get the raw target object from a tracking proxy, or the value itself if not a proxy.
 *
 * Use this when you need identity comparison between values that may be
 * tracking proxies. Since `proxy === rawObject` is always `false` in JS,
 * unwrapping both sides allows correct identity checks:
 *
 * ```ts
 * import { unwrap } from 'react-redux/signals'
 *
 * const selector = (state) => {
 *   const current = unwrap(state.current)
 *   return state.items.find(item => item === current)
 * }
 * ```
 *
 * Safe to call on non-proxy values — returns them unchanged.
 *
 * @param value - The value to unwrap (proxy or raw)
 * @returns The raw target object, or the original value if not a tracking proxy
 */
export function unwrap<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    const target = proxyTargetMap.get(value as object)
    if (target !== undefined) return target as T
    const holder = recordingHolders.get(value as object)
    if (holder !== undefined) return holder.current as T
  }
  return value
}

/**
 * Path key for an object element of a tracked array: the identity path
 * (`items.{id:42}`) when the array has a detectable key field, otherwise
 * the index path (`items.3`). Detects and records the array's key field
 * on first use.
 * @param registry - Signal registry holding per-array metadata
 * @param arrayPath - Path of the containing array
 * @param index - The element's index (number or canonical index string)
 * @param element - The raw element object
 * @returns The element's path key
 */
export function getElementPathKey(
  registry: PathSignalRegistry,
  arrayPath: string,
  index: number | string,
  element: object,
): string {
  if (!Array.isArray(element)) {
    let meta = registry.getArrayMeta(arrayPath)
    if (!meta) {
      const keyField = findKeyField(element)
      if (keyField) {
        meta = { keyField, entityMap: new Map() }
        registry.setArrayMeta(arrayPath, meta)
      }
    }
    if (meta) {
      const kv = getKeyValue(element, meta.keyField)
      if (kv !== undefined) {
        return buildIdentityPath(arrayPath, meta.keyField, kv)
      }
    }
  }
  return joinPath(
    arrayPath,
    typeof index === 'number' ? index : encodePathSegment(index),
  )
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
 *
 * Child proxies are cached in `registry.proxyCache`, keyed by target
 * identity. The cache persists across evaluations and dispatches, so an
 * unchanged subtree yields the same proxy object every time — selector
 * results built from those proxies stay referentially equal. The root
 * proxy is the exception: it is created fresh on every call so that
 * caches keyed on the state argument cannot skip the selector body.
 * @param target - The frozen state object to wrap
 * @param parentPath - Dot-separated path to this object in the state tree
 * @param registry - Signal registry for dependency tracking
 * @param cache - Proxy cache for deduplication
 * @param leafTracker - Optional tracker for detecting leaf object accesses.
 *   When provided, it becomes the ACTIVE tracker for the registry: all
 *   proxy traps (including those of previously cached proxies) record
 *   into it until another evaluation installs a different tracker.
 * @returns A tracking proxy wrapping the target
 */
export function createTrackingProxy<T extends object>(
  target: T,
  parentPath: string,
  registry: PathSignalRegistry,
  cache: ProxyCache,
  leafTracker?: LeafObjectTracker,
): T {
  // Install the tracker for this evaluation. Traps read the holder at
  // access time instead of closing over a tracker, so proxies cached by
  // an earlier evaluation record into the current evaluation's tracker.
  if (leafTracker !== undefined) {
    registry.leafTrackerHolder.current = leafTracker
  }

  // The root proxy is never cached: every evaluation gets a fresh one.
  // Memoized selectors (Reselect's argsMemoize, WeakMap caches keyed on
  // the state argument) short-circuit when handed an argument they have
  // seen before, and a short-circuited call reads no state properties, so
  // the evaluation would record no dependencies. A fresh root defeats
  // that cache every time. Result functions stay memoized because their
  // inputs are child proxies, which ARE cached by target identity.
  const isRoot = parentPath === ''
  if (isRoot) {
    registry.evalEpoch++
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
  // The memo is scoped by registry.evalEpoch, not by tracker identity:
  // useSignalSelector reuses one tracker across evaluations, and a stale
  // hit on a later evaluation would silently drop the dependency.
  let lastEpoch = -1
  let lastProp: string | undefined
  let lastValue: unknown
  let repeatCount = 0

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
    ? registry.rootPathKeyCache
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

      if (prop === lastProp && registry.evalEpoch === lastEpoch) {
        if (process.env.NODE_ENV !== 'production') {
          if (++repeatCount === REPEATED_READ_WARN_THRESHOLD) {
            warnRepeatedRead(registry, getPathKey(prop))
          }
        }
        return lastValue
      }

      const value = (target as Record<string, unknown>)[prop]
      const leafTracker = registry.leafTrackerHolder.current

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
          pathKey = getElementPathKey(registry, parentPath, prop, value)
        }

        // Non-plain objects (Date, Map, Set, class instances): return the
        // raw object, tracked by reference only. Wrapping them in a proxy
        // shell breaks prototype methods that need internal slots
        // ("this is not a Date object"), and the diff can't recurse into
        // them anyway. Reading the version signal here means a ref swap
        // at this path re-runs the selector.
        if (!Array.isArray(value) && !isPlainObject(value as object)) {
          if (leafTracker) {
            leafTracker.traversedPaths.add(parentPath)
          }
          registry.getOrCreate(pathKey, value).get()
          return value
        }

        // Register in prefix index (for hasPrefix/diff tracking) but DON'T
        // create a signal. This avoids allocating signals for intermediate
        // objects that are only traversed, not read as terminal values.
        registry.ensurePrefix(pathKey)

        // Mark parent as traversed (it has children being accessed)
        if (leafTracker) {
          leafTracker.traversedPaths.add(parentPath)
        }

        // Return cached child proxy (createTrackingProxy checks cache internally).
        // No tracker argument: the trap already reads the registry's
        // active-tracker holder, which this evaluation installed.
        const childProxy = createTrackingProxy(
          value as object,
          pathKey,
          registry,
          cache,
        )

        // Track this object access — may be a leaf (identity-only usage)
        if (leafTracker) {
          leafTracker.accessedObjects.set(pathKey, value as object)
        }

        return childProxy
      }

      // Mark parent as traversed (it has children being accessed)
      if (leafTracker) {
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

      lastEpoch = registry.evalEpoch
      lastProp = prop as string
      lastValue = value
      repeatCount = 0

      return value
    },

    // Track when selectors iterate keys (Object.keys, for...in, .map, .filter, etc.)
    ownKeys(_obj) {
      registry
        .getOrCreate(keysMetaPath(parentPath), Reflect.ownKeys(target))
        .get()
      return Reflect.ownKeys(target)
    },

    // Track has() checks for conditional property access (e.g., 'key' in obj)
    has(_obj, prop) {
      if (typeof prop === 'symbol') return Reflect.has(target, prop)
      const pathKey = getPathKey(prop as string)
      registry
        .getOrCreate(pathKey, (target as Record<string, unknown>)[prop])
        .get()
      return Reflect.has(target, prop)
    },

    // Delegate to real target for property descriptors
    getOwnPropertyDescriptor(_obj, prop) {
      const desc = Object.getOwnPropertyDescriptor(target, prop)
      if (desc) {
        // Mark as configurable so the proxy can return different values
        // (our proxy may return child proxies for object properties)
        return { ...desc, configurable: true }
      }
      return desc
    },

    // Report the real target's prototype
    getPrototypeOf(_obj) {
      return Object.getPrototypeOf(target)
    },

    // Report the real target's extensibility
    isExtensible(_obj) {
      return Object.isExtensible(target)
    },

    // Prevent mutation
    set(_obj, prop) {
      throwStateMutationError('set', String(prop))
    },
    deleteProperty(_obj, prop) {
      throwStateMutationError('delete', String(prop))
    },
  }) as T

  // Cache by target identity — unchanged Immer subtrees reuse same proxy
  if (!isRoot) {
    cache.set(target, proxy)
  }
  proxyPathMap.set(proxy as object, parentPath)
  proxyTargetMap.set(proxy as object, target)

  return proxy
}
