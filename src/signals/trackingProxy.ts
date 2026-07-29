import {
  buildIdentityPath,
  encodePathSegment,
  findKeyField,
  getKeyValue,
} from './arrayKeys'
import {
  isOverriddenArrayMethod,
  createArrayMethodInterceptor,
} from './arrayMethodOverrides'
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
 * Child proxies are cached within a single evaluation to avoid duplicates.
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

  // Check proxy cache — reuse proxy if we've already wrapped this exact object
  const cached = cache.get(target)
  if (cached) return cached as T

  // Use an unfrozen shell as the proxy target to avoid ES Proxy invariant
  // violations with frozen objects. The shell copies the target's prototype
  // so that Array.isArray, instanceof, etc. work correctly.
  const shell = Array.isArray(target) ? [] : Object.create(Object.getPrototypeOf(target))

  // Per-proxy cache of prop -> full path string. parentPath is fixed for
  // this proxy's lifetime, so path keys are stable. Reusing the same
  // string instance avoids re-allocating on every read AND lets V8 cache
  // the string hash, speeding up the registry Map lookups downstream.
  // Property keys are encoded so reserved path characters in state keys
  // (dots in RTKQ cache keys, literal '@@keys', etc.) can't collide with
  // other paths or meta segments. The cache amortizes the encoding.
  const pathKeyCache = new Map<string, string>()
  function getPathKey(prop: string): string {
    let key = pathKeyCache.get(prop)
    if (key === undefined) {
      const segment = encodePathSegment(prop)
      key = parentPath ? parentPath + '.' + segment : segment
      pathKeyCache.set(prop, key)
    }
    return key
  }

  const proxy = new Proxy(shell, {
    get(_obj, prop, _receiver) {
      // Symbols: read from actual target (iterator protocol, toStringTag, etc.)
      if (typeof prop === 'symbol') return Reflect.get(target, prop)

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
          return createArrayMethodInterceptor(target, proxy, prop as string, registry, parentPath)
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
        // For array element access: check if parent array has identity-based tracking.
        // If so, use the identity path (items.{id:42}) instead of index path (items.0).
        if (Array.isArray(target) && !Array.isArray(value) && !isNaN(Number(prop))) {
          let meta = registry.getArrayMeta(parentPath)
          if (!meta) {
            // First time accessing this array's elements — try to detect key field
            const keyField = findKeyField(value)
            if (keyField) {
              meta = { keyField, entityMap: new Map() }
              registry.setArrayMeta(parentPath, meta)
            }
          }
          if (meta) {
            const kv = getKeyValue(value, meta.keyField)
            if (kv !== undefined) {
              pathKey = buildIdentityPath(parentPath, meta.keyField, kv)
            }
          }
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

      // Return the actual value
      return value
    },

    // Track when selectors iterate keys (Object.keys, for...in, .map, .filter, etc.)
    // Built raw (NOT via getPathKey): '@@keys' is a meta segment, and
    // getPathKey would %-escape its '@'s like a state key's.
    ownKeys(_obj) {
      const keysPath = parentPath ? parentPath + '.@@keys' : '@@keys'
      registry.getOrCreate(keysPath, Reflect.ownKeys(target)).get()
      return Reflect.ownKeys(target)
    },

    // Track has() checks for conditional property access (e.g., 'key' in obj)
    has(_obj, prop) {
      if (typeof prop === 'symbol') return Reflect.has(target, prop)
      const pathKey = getPathKey(prop as string)
      registry.getOrCreate(pathKey, (target as Record<string, unknown>)[prop]).get()
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
    set() {
      return false
    },
    deleteProperty() {
      return false
    },
  }) as T

  // Cache by target identity — unchanged Immer subtrees reuse same proxy
  cache.set(target, proxy)
  proxyPathMap.set(proxy as object, parentPath)
  proxyTargetMap.set(proxy as object, target)

  return proxy
}
