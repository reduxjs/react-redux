import { buildIdentityPath, findKeyField, getKeyValue } from './arrayKeys'
import {
  isOverriddenArrayMethod,
  createArrayMethodInterceptor,
} from './arrayMethodOverrides'
import type { PathSignalRegistry } from './pathSignalRegistry'

function isObjectOrArray(v: unknown): v is object {
  return v !== null && typeof v === 'object'
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
export function unwrap<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    return (proxyTargetMap.get(value as object) as T) ?? value
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
 * @param leafTracker - Optional tracker for detecting leaf object accesses
 * @returns A tracking proxy wrapping the target
 */
export function createTrackingProxy<T extends object>(
  target: T,
  parentPath: string,
  registry: PathSignalRegistry,
  cache: ProxyCache,
  leafTracker?: LeafObjectTracker,
): T {
  // Check proxy cache — reuse proxy if we've already wrapped this exact object
  const cached = cache.get(target)
  if (cached) return cached as T

  // Use an unfrozen shell as the proxy target to avoid ES Proxy invariant
  // violations with frozen objects. The shell copies the target's prototype
  // so that Array.isArray, instanceof, etc. work correctly.
  const shell = Array.isArray(target) ? [] : Object.create(Object.getPrototypeOf(target))

  const proxy = new Proxy(shell, {
    get(_obj, prop, _receiver) {
      // Symbols: read from actual target (iterator protocol, toStringTag, etc.)
      if (typeof prop === 'symbol') return Reflect.get(target, prop)

      const value = (target as Record<string, unknown>)[prop]

      // Functions: intercept array methods to avoid per-element proxy creation
      if (typeof value === 'function') {
        if (Array.isArray(target) && isOverriddenArrayMethod(prop as string)) {
          return createArrayMethodInterceptor(target, proxy, prop as string)
        }
        return value
      }

      let pathKey = parentPath ? parentPath + '.' + (prop as string) : (prop as string)

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

        // Register in prefix index (for hasPrefix/diff tracking) but DON'T
        // create a signal. This avoids allocating signals for intermediate
        // objects that are only traversed, not read as terminal values.
        registry.ensurePrefix(pathKey)

        // Mark parent as traversed (it has children being accessed)
        if (leafTracker) {
          leafTracker.traversedPaths.add(parentPath)
        }

        // Return cached child proxy (createTrackingProxy checks cache internally)
        const childProxy = createTrackingProxy(
          value as object,
          pathKey,
          registry,
          cache,
          leafTracker,
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
      // Also read the immediate parent's version signal so that identity
      // changes to the parent object (ref swaps) are tracked. Skip for
      // root-level primitives (parentPath === '') since the root object
      // changes on every dispatch and would defeat the optimization.
      if (parentPath !== '') {
        registry.getOrCreate(parentPath, target).get()
      }
      registry.getOrCreate(pathKey, value).get()

      // Return the actual value
      return value
    },

    // Track when selectors iterate keys (Object.keys, for...in, .map, .filter, etc.)
    ownKeys(_obj) {
      const keysPath = parentPath ? parentPath + '.@@keys' : '@@keys'
      registry.getOrCreate(keysPath, Reflect.ownKeys(target)).get()
      return Reflect.ownKeys(target)
    },

    // Track has() checks for conditional property access (e.g., 'key' in obj)
    has(_obj, prop) {
      if (typeof prop === 'symbol') return Reflect.has(target, prop)
      const pathKey = parentPath ? parentPath + '.' + (prop as string) : (prop as string)
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
